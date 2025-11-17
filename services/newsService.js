const pool = require('../config/db');

function normalizeContentBlocks(blocks = []) {
  const out = [];
  for (const b of blocks) {
    if (!b) continue;
    if (b.type === 'image') {
      // build normalized urls array of objects { url, position }
      let urlsList = [];
      if (Array.isArray(b.urls)) {
        for (let i = 0; i < b.urls.length; i++) {
          const it = b.urls[i];
          if (!it) continue;
          if (typeof it === 'string') {
            urlsList.push({ url: it.trim(), position: i + 1 });
          } else if (typeof it === 'object' && it.url) {
            urlsList.push({ url: String(it.url).trim(), position: Number.isFinite(Number(it.position)) ? Number(it.position) : (i + 1) });
          }
        }
      } else if (b.url) {
        urlsList.push({ url: String(b.url).trim(), position: 1 });
      }
      if (urlsList.length === 0) continue;
      const last = out[out.length - 1];
      if (last && last.type === 'image') {
        // merge and keep positions (will be normalized/sorted later)
        last.urls = last.urls.concat(urlsList);
      } else {
        out.push({ type: 'image', urls: urlsList });
      }
    } else if (b.type === 'text') {
      out.push({ type: 'text', text: String(b.text ?? '').trim() });
    } else {
      // ignore unknown types
    }
  }

  // normalize positions in each image block: if positions missing or duplicated, reassign sequentially
  for (const blk of out) {
    if (blk.type === 'image') {
      // sort by provided position when valid, otherwise keep insertion order
      blk.urls = blk.urls
        .map((u, idx) => ({ url: String(u.url).trim(), position: Number.isFinite(Number(u.position)) ? Number(u.position) : (idx + 1) }))
        .sort((a, b) => a.position - b.position);

      // ensure unique, monotonic positions (1..n)
      blk.urls = blk.urls.map((u, idx) => ({ url: u.url, position: idx + 1 }));
    }
  }

  return out;
}

function validateContentBlocks(blocks = []) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw Object.assign(new Error('content_blocks must be a non-empty array'), { status: 400 });
  }
  const maxBlocks = 11;
  if (blocks.length > maxBlocks) throw Object.assign(new Error(`content_blocks max ${maxBlocks} blocks`), { status: 400 });

  if (blocks.length % 2 === 0) throw Object.assign(new Error('content_blocks must have odd length and follow text->image->... pattern'), { status: 400 });

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (i % 2 === 0) {
      // text expected
      if (!b || b.type !== 'text' || typeof b.text !== 'string' || b.text.trim() === '') {
        throw Object.assign(new Error(`block ${i} must be a non-empty text block`), { status: 400 });
      }
      if (b.text.length > 500000) throw Object.assign(new Error(`text block ${i} too long`), { status: 400 });
    } else {
      // image expected - now require urls: [{url, position}]
      if (!b || b.type !== 'image') {
        throw Object.assign(new Error(`block ${i} must be an image block`), { status: 400 });
      }
      const urls = Array.isArray(b.urls) ? b.urls : [];
      if (!Array.isArray(urls) || urls.length === 0) {
        throw Object.assign(new Error(`block ${i} must contain at least one image url`), { status: 400 });
      }
      const seenPos = new Set();
      for (let j = 0; j < urls.length; j++) {
        const u = urls[j];
        if (!u || typeof u.url !== 'string' || !u.url.trim()) throw Object.assign(new Error(`block ${i} image url ${j} invalid`), { status: 400 });
        if (!/^https?:\/\//i.test(u.url)) throw Object.assign(new Error(`block ${i} image url ${j} must be absolute https/http url`), { status: 400 });
        const p = Number(u.position);
        if (!Number.isFinite(p) || p <= 0 || Math.floor(p) !== p) throw Object.assign(new Error(`block ${i} image position ${j} invalid`), { status: 400 });
        if (seenPos.has(p)) throw Object.assign(new Error(`block ${i} contains duplicate image position ${p}`), { status: 400 });
        seenPos.add(p);
      }
    }
  }
  return true;
}

exports.createNews = async ({ title, content_blocks = [], image = null }) =>{
    if(!title) throw Object.assign(new Error('title is required'), { status: 400 });

    // normalize incoming blocks (this will merge consecutive image blocks into one and normalize positions)
    const normalizedBlocks = normalizeContentBlocks(content_blocks);
    validateContentBlocks(normalizedBlocks);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let leadImage = image;
        if(!leadImage){
            const firstImageBlock = normalizedBlocks.find(b => b.type === 'image' && Array.isArray(b.urls) && b.urls.length);
            if(firstImageBlock) leadImage = firstImageBlock.urls[0].url; // pick first by position
        }

        const q =`
          INSERT INTO news (id, title, content, image, content_blocks, created_at, updated_at)
          VALUES (public.uuid_generate_v4(), $1, $2, $3, $4, NOW(), NOW())
          RETURNING id, title, image, content_blocks, created_at, updated_at
        `;

        const contentText = normalizedBlocks.length ? normalizedBlocks.map(b => b.type === 'text' ? b.text : '').join('\n') : null;
        const params = [title, contentText, leadImage, JSON.stringify(normalizedBlocks)];
        const { rows } = await client.query(q, params);
        await client.query('COMMIT');
        return rows[0];
    }catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }finally {
        client.release();
    }
};

exports.updateNews = async (newsId, { title, content_blocks, image } = {}) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const fields = [];
        const params = [];
        let idx = 1;

        if(title !== undefined){
            fields.push(`title = $${idx++}`);
            params.push(title);
        }
        if(content_blocks !== undefined){
            const normalized = normalizeContentBlocks(content_blocks);
            validateContentBlocks(normalized);
            const contentText = normalized.length ? normalized.map(b => b.type === 'text' ? b.text : '').join('\n') : null;
            fields.push(`content_blocks = $${idx++}`);
            params.push(JSON.stringify(normalized));
            fields.push(`content = $${idx++}`);
            params.push(contentText);

            // if image not provided, consider updating image from first image block
            if (image === undefined) {
                const firstImageBlock = normalized.find(b => b.type === 'image' && Array.isArray(b.urls) && b.urls.length);
                if (firstImageBlock) {
                fields.push(`image = $${idx++}`);
                params.push(firstImageBlock.urls[0].url);
                }
            }
        }

         if (image !== undefined) { fields.push(`image = $${idx++}`); params.push(image); }

        if (fields.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }

        params.push(newsId);
        const q = `UPDATE news SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING id, title, image, content_blocks, created_at, updated_at`;
        const { rows } = await client.query(q, params);
        await client.query('COMMIT');
        return rows[0] || null;
    }catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }finally {
        client.release();
    }
};

exports.deleteNews = async (newsId) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const q = `DELETE FROM news WHERE id = $1 RETURNING id`;
        const { rows } = await client.query(q, [newsId]);
        await client.query('COMMIT');
        return !!rows[0];
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
};

exports.getNewsById = async (newsId) => {
    const { rows } = await pool.query(
        `SELECT id, title, image, content_blocks, created_at, updated_at FROM news WHERE id = $1 LIMIT 1`,
        [newsId]
    );
    return rows[0] || null;
};

exports.getNewsList = async ({ q = null, page = 1, limit = 10 } = {}) => {
    const offset = (Math.max(1, page) - 1) * limit;
    const params = [];
    let where = '';
    if (q && String(q).trim()) {
        params.push(`%${String(q).trim()}%`);
        where = `WHERE title ILIKE $1 OR content ILIKE $1`;
    }
    const sql = `
        SELECT id, title, image, content_blocks, created_at, updated_at
        FROM news
        ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);
    const { rows } = await pool.query(sql, params);
    return rows;
};
