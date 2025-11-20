const pool = require('../config/db');
const {
  validatePrice,
  validateStockQuantity,
  validateSalePercent,
  validateSoldQuantity
} = require('../utils/validate');

exports.getProducts = async ({
  search_key,
  category_id,
  supplier_id,
  is_flash_sale,
  min_price,
  max_price,
  status,
  limit = 10,
  page = 1,
  cursor = null,    // sequence_id cursor for keyset paging (optional)
  order = 'asc'     // 'asc' or 'desc' when using cursor
} = {}) => {
  const params = [];
  let idx = 1;
  const where = [];

  // normalize order once for both cursor and offset branches
  const ord = String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  // status (default active)
  if (typeof status === 'undefined' || status === null) {
    where.push(`p.status = $${idx++}`);
    params.push('active');
  } else if (status !== 'all') {
    where.push(`p.status = $${idx++}`);
    params.push(status);
  }

  if (search_key && String(search_key).trim()) {
    const sk = `%${String(search_key).trim()}%`;
    where.push(`(
      v.name ILIKE $${idx} OR 
      v.description ILIKE $${idx + 1} OR 
      COALESCE(v.supplier_name, '') ILIKE $${idx + 2} OR
      COALESCE(v.category_name,'') ILIKE $${idx + 3})`);
    params.push(sk, sk, sk, sk);
    idx += 4;
  }

  if (category_id) {
    where.push(`p.category_id = $${idx++}`);
    params.push(category_id);
  }

  if (supplier_id) {
    where.push(`p.supplier_id = $${idx++}`);
    params.push(supplier_id);
  }

  if (is_flash_sale !== undefined && is_flash_sale !== null) {
    where.push(`p.is_flash_sale = $${idx++}`);
    params.push(Boolean(is_flash_sale));
  }

  if (min_price !== undefined && min_price !== null) {
    where.push(`v.final_price >= $${idx++}`);
    params.push(min_price);
  }
  if (max_price !== undefined && max_price !== null) {
    where.push(`v.final_price <= $${idx++}`);
    params.push(max_price);
  }

  // Build base FROM (use v_product_full as v and products as p for sequence_id)
  let sql = `SELECT v.*, p.sequence_id
             FROM v_product_full v
             JOIN public.products p ON p.id = v.id`;

  if (where.length) {
    sql += ' WHERE ' + where.join(' AND ');
  }

  const useCursor = cursor !== undefined && cursor !== null && String(cursor).trim() !== '';

  if (useCursor) {
    const curVal = Number(cursor);
    const curParam = Number.isFinite(curVal) ? curVal : 0;

    sql += ` AND p.sequence_id::bigint ${ord === 'ASC' ? '>' : '<'} $${idx}`;
    params.push(curParam);
    idx++;

    // fetch one extra row to determine hasMore
    const fetchLimit = Number(limit) + 1;
    sql += ` ORDER BY p.sequence_id::bigint ${ord} LIMIT $${idx}`;
    params.push(fetchLimit);
    idx++;
  } else {
    // classic offset pagination
    const pageNum = Math.max(1, Number(page) || 1);
    const perPage = Math.max(1, Number(limit) || 10);
    const offset = (pageNum - 1) * perPage;
    // use ord for offset too
    sql += ` ORDER BY p.sequence_id::bigint ${ord} LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(perPage, offset);
  }

  // after query
  const r = await pool.query(sql, params);
  const rows = r.rows || [];

  if (!useCursor) return rows;

  // cursor mode: decide hasMore by presence of extra row
  const hasMore = rows.length > Number(limit);
  const products = hasMore ? rows.slice(0, Number(limit)) : rows;
  const nextCursor = products.length > 0 && hasMore
    ? Number(products[products.length - 1].sequence_id)
    : (products.length > 0 ? Number(products[products.length - 1].sequence_id) : null);

  // if no extra row -> no more pages => nextCursor could be null to indicate end
  const finalNextCursor = hasMore ? nextCursor : null;
  return { products, nextCursor: finalNextCursor, hasMore };
};

exports.createProduct = async (productData) => {
  const {
    name, description, category_id, supplier_id,
    price, sale_percent = 0, is_flash_sale = false,
    images = [], variants = []
  } = productData;

  productData.price = validatePrice(price);
  productData.sale_percent = validateSalePercent(sale_percent);

  for(const v of variants){
    v.stock_qty = validateStockQuantity(v.stock_qty);

    if(v.sold_qty !== undefined){
      v.sold_qty = validateSoldQuantity(v.sold_qty);
    }
  }

  //validate: sp có ít nhất 1 ảnh
  if(!images || images.length === 0){
      const err = new Error('Product must have at least 1 image');
      err.statusCode = 400;
      throw err;
  }

  //validate: variant have at least 1 variant image
  for( const variant of variants){
      if(!variant.images || variant.images.length === 0){
        const err = new Error(`Variant ${variant.sku} must have at least 1 image`);
        err.statusCode = 400;
        throw err;
      }
  }

  // set to match DB (ensure you ALTER TABLE to same value)
  const MAX_SKU_LEN = 64;
  const MAX_COLOR_CODE_LEN = 32;

  // debug log before DB work
  console.log('createProduct - variants:', JSON.stringify(variants, null, 2));

  // Validate variant fields early and return clear message
  for (const v of variants) {
    if (!v.sku || typeof v.sku !== 'string') {
      const err = new Error('Each variant must have a SKU');
      err.statusCode = 400;
      throw err;
    }
    if (v.sku.length > MAX_SKU_LEN) {
      const err = new Error(`SKU "${v.sku}" is too long (length=${v.sku.length}, max=${MAX_SKU_LEN})`);
      err.statusCode = 400;
      throw err;
    }
    if (v.color_code && v.color_code.length > MAX_COLOR_CODE_LEN) {
      const err = new Error(`color_code "${v.color_code}" is too long (length=${v.color_code.length}, max=${MAX_COLOR_CODE_LEN})`);
      err.statusCode = 400;
      throw err;
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // === 1. VALIDATE category & supplier ===
    const cat = await client.query('SELECT id FROM categories WHERE id = $1', [category_id]);
    if (cat.rowCount === 0) throw new Error('Invalid category_id');

    const sup = await client.query('SELECT id FROM suppliers WHERE id = $1', [supplier_id]);
    if (sup.rowCount === 0) throw new Error('Invalid supplier_id');

    // === 2. INSERT PRODUCT ===
    const productRes = await client.query(
      `INSERT INTO products 
       (name, description, category_id, supplier_id, price, sale_percent, is_flash_sale)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [name, description, category_id, supplier_id, price, sale_percent, is_flash_sale]
    );
    const productId = productRes.rows[0].id;

    // === 3. INSERT PRODUCT IMAGES (ảnh đầu = chính) ===
    if (images.length > 0) {
      const params = [];
      const values = images.map((url) => {
        // push productId, url for each row and build incremental placeholders
        const idx = params.length + 1; // 1-based index for placeholder
        params.push(productId, url);
        return `($${idx}, $${idx + 1})`;
      }).join(',');
      await client.query(
        `INSERT INTO product_images (product_id, url) VALUES ${values}`,
        params
      );
    }

    // === 4. VALIDATE ALL SKUs BEFORE INSERT ===
    const skuList = variants.map(v => v.sku).filter(Boolean);
    if (skuList.length !== variants.length) {
      throw new Error('All variants must have SKU');
    }

    const duplicateSkus = skuList.filter((sku, idx) => skuList.indexOf(sku) !== idx);
    if (duplicateSkus.length > 0) {
      throw new Error(`Duplicate SKUs: ${duplicateSkus.join(', ')}`);
    }

    // Kiểm tra SKU đã tồn tại trong DB
    for (const sku of skuList) {
      const exists = await client.query('SELECT 1 FROM product_variants WHERE sku = $1', [sku]);
      if (exists.rowCount > 0) {
        throw new Error(`SKU "${sku}" already exists`);
      }
    }

    // === 5. INSERT VARIANTS + IMAGES ===
    for (const variant of variants) {
      const { sku, color_name, color_code, sizes, stock_qty, images: variantImages = [] } = variant;

      // Insert variant
      const variantRes = await client.query(
        `INSERT INTO product_variants 
         (product_id, sku, color_name, color_code, sizes, stock_qty)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         RETURNING id`,
        [productId, sku, color_name, color_code, JSON.stringify(sizes), stock_qty]
      );
      const variantId = variantRes.rows[0].id;

      // Insert variant images
      if (variantImages.length > 0) {
        const paramsImg = [];
        const placeholders = variantImages.map((url) => {
          const idx = paramsImg.length + 1;
          paramsImg.push(variantId, url);
          return `($${idx}, $${idx + 1})`;
        }).join(',');
        await client.query(
          `INSERT INTO product_images (variant_id, url) VALUES ${placeholders}`,
          paramsImg
        );
      }
    }

    await client.query('COMMIT');

    // === 6. LẤY DỮ LIỆU ĐẦY ĐỦ (NESTED JSON) ===
    const result = await client.query(
        `SELECT 
            p.id,
            p.name,
            p.description,
            p.price,
            p.sale_percent,
            p.is_flash_sale,
            s.name as brand,
            CAST(p.final_price AS INTEGER) AS final_price,
            c.name AS category_name,
            s.name AS supplier_name,
            COALESCE(
              (
                SELECT json_agg(json_build_object('url', pi.url) ORDER BY pi.id)
                FROM product_images pi
                WHERE pi.product_id = p.id AND pi.variant_id IS NULL
              ), '[]'::json
            ) AS product_images,
            COALESCE(
              (
                SELECT json_agg(
                  json_build_object(
                    'id', pv.id,
                    'sku', pv.sku,
                    'color_name', pv.color_name,
                    'color_code', pv.color_code,
                    'sizes', pv.sizes,
                    'stock_qty', pv.stock_qty,
                    'images', (
                      SELECT COALESCE(
                        json_agg(json_build_object('url', pi2.url) ORDER BY pi2.id),
                        '[]'::json
                      )
                      FROM product_images pi2
                      WHERE pi2.variant_id = pv.id
                    )
                  ) ORDER BY pv.id
                )
                FROM product_variants pv
                WHERE pv.product_id = p.id
              ), '[]'::json
            ) AS variants
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN suppliers s ON p.supplier_id = s.id
        WHERE p.id = $1`,
        [productId]
    );

    return result.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.updateFlashSale = async(productId, { sale_percent, is_flash_sale})=> {
  const client = await pool.connect();

  try{
    await client.query('BEGIN');

    // Validate ở BE trước
    if (is_flash_sale === true && (!sale_percent || sale_percent <= 0)) {
      throw new Error('sale_percent must be greater than 0 when is_flash_sale = true');
    }

    const result = await client.query(
      `UPDATE products
      SET sale_percent = $1, is_flash_sale = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *`,
      [sale_percent, is_flash_sale, productId]
    );

    if (result.rowCount === 0) throw new Error ('Product not found');

    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');

    // XỬ LÝ LỖI TỪ CHECK CONSTRAINT
    if (error.constraint === 'chk_flash_sale_percent') {
      throw new Error('Cannot enable flash sale with 0% discount');
    }
    throw error;
  } finally {
    client.release();
  }
};

exports.updateProduct = async (productId, data) => {
  const { name, description, price, images = [], variants = [] } = data;

  if (!price || price <= 0) {
    throw new Error('Price must be greater than 0');
  }

  // VALIDATE: Nếu có gửi images → phải có ít nhất 1
  if (images.length === 0) {
    const err = new Error('Product must have at least 1 image');
    err.statusCode = 400;
    throw err;
  }

  // VALIDATE: Mỗi variant phải có ít nhất 1 ảnh
  for (const v of variants) {
    if (!v.images || v.images.length === 0) {
      const err = new Error(`Variant SKU "${v.sku}" must have at least 1 image`);
      err.statusCode = 400;
      throw err;
    }
  }
  const client = await pool.connect();

  try{
    await client.query('BEGIN');

    //1. cập nhật product
    const productRes = await client.query(
      `UPDATE products
      SET name = $1, description = $2, price = $3, updated_at = NOW()
      WHERE id = $4
      RETURNING *`,
      [name, description, price, productId]
    );
    if (productRes.rowCount === 0) throw new Error ('Product not found');

    //2. Xóa ảnh cũ + thêm mới (product images)
    await client.query('DELETE FROM product_images WHERE product_id = $1 AND variant_id IS NULL', [productId]);
    if(images.length > 0){
      const values = images.map((_, i)=> `($1, $${i+2})`).join(',');
      const params = [productId, ...images];
      await client.query(
        `INSERT INTO product_images (product_id, url) VALUES ${values}`,
        params
      );
    }

    //3. Xóa variants cũ + ảnh của variants
    const oldVariants = await client.query('SELECT id FROM product_variants WHERE product_id = $1', [productId]);
    for (const v of oldVariants.rows){
      await client.query('DELETE FROM product_images WHERE variant_id = $1', [v.id]);
    }
    // fix: thêm dấu '=' cho WHERE
    await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);

    //4. Thêm variants mới
    for(const variant of variants){
      // use the iterator variable `variant` (was `v` before)
      const { sku, color_name, color_code, sizes, stock_qty, images: vImages = [] } = variant;
      
      //kiểm tra sku 
      const checkSku = await client.query('SELECT 1 FROM product_variants WHERE sku = $1', [sku]);
      if(checkSku.rowCount > 0){
        throw new Error (`SKU "${sku}" already exists`);
      }

      const variantRes = await client.query(
        `INSERT INTO product_variants 
         (product_id, sku, color_name, color_code, sizes, stock_qty)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6)
         RETURNING id`,
        [productId, sku, color_name, color_code, JSON.stringify(sizes), stock_qty]
      );
      const variantId = variantRes.rows[0].id;

      if(vImages.length > 0){
        const values = vImages.map((_, i)=> `($1, $${i+2})`).join(',');
        await client.query(
          `INSERT INTO product_images (variant_id, url) VALUES ${values}`,
          [variantId, ...vImages]
        );
      }
    }

    //5. Trả dữ liệu đầy đủ
    const full = await client.query(
      `SELECT * FROM v_product_full WHERE id = $1`, [productId]
    );

    await client.query('COMMIT');
    return full.rows[0];
  }catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

exports.deleteProduct = async (productId) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // kiểm tra tồn tại
    const check = await client.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (check.rowCount === 0) {
      await client.query('ROLLBACK');
      const err = new Error('Product not found');
      err.statusCode = 404;
      throw err;
    }

    // xóa ảnh variants trước
    await client.query(
      `DELETE FROM product_images
       WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = $1)`,
      [productId]
    );

    // xóa variants
    await client.query('DELETE FROM product_variants WHERE product_id = $1', [productId]);

    // xóa ảnh product (không có variant_id)
    await client.query('DELETE FROM product_images WHERE product_id = $1 AND variant_id IS NULL', [productId]);

    // xóa product
    const del = await client.query('DELETE FROM products WHERE id = $1 RETURNING id', [productId]);
    await client.query('COMMIT');

    return del.rows[0] || null;
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('deleteProduct error:', error && error.stack ? error.stack : error);
    throw error;
  } finally {
    if (client) client && client.release();
  }
};


exports.getProductById = async (productId) => {
  const q = `
    SELECT 
      p.id,
      p.name,
      p.description,
      p.price,
      p.sale_percent,
      p.is_flash_sale,
      c.name AS category_name,
      s.name AS supplier_name,
      COALESCE(
        (
          SELECT json_agg(json_build_object('url', pi.url) ORDER BY pi.id)
          FROM product_images pi
          WHERE pi.product_id = p.id AND pi.variant_id IS NULL
        ), '[]'::json
      ) AS product_images,
      COALESCE(
        (
          SELECT json_agg(
            json_build_object(
              'id', pv.id,
              'sku', pv.sku,
              'color_name', pv.color_name,
              'color_code', pv.color_code,
              'sizes', pv.sizes,
              'stock_qty', pv.stock_qty,
              'images', (
                SELECT COALESCE(json_agg(json_build_object('url', pi2.url) ORDER BY pi2.id), '[]'::json)
                FROM product_images pi2
                WHERE pi2.variant_id = pv.id
              )
            ) ORDER BY pv.id
          )
          FROM product_variants pv
          WHERE pv.product_id = p.id
        ), '[]'::json
      ) AS variants
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.id = $1
  `;
  const res = await pool.query(q, [productId]);
  return res.rowCount ? res.rows[0] : null;
};


exports.getAvailableProducts = async () => {
  const result = await pool.query(`
    SELECT 
      p.id,
      p.name,
      p.description,
      p.price::integer,
      p.final_price,
      c.name AS category_name,
      pv.color_name,
      pv.color_code,
      pv.sizes,
      pv.stock_qty,
      COALESCE(pi.urls, '[]'::jsonb) AS images,
      json_build_object(
        'style_tags', COALESCE(ARRAY[
          CASE WHEN p.name ILIKE '%polo%' THEN 'polo' END,
          CASE WHEN p.name ILIKE '%jean%' THEN 'jeans' END,
          CASE WHEN p.name ILIKE '%áo thun%' THEN 'casual' END,
          CASE WHEN p.price > 500000 THEN 'premium' ELSE 'affordable' END
        ] FILTER (WHERE ... không null), '{}')
      ) AS inferred_tags
    FROM products p
    JOIN product_variants pv ON pv.product_id = p.id
    LEFT JOIN (
      SELECT variant_id, json_agg(json_build_object('url', url)) AS urls
      FROM product_images WHERE variant_id IS NOT NULL
      GROUP BY variant_id
    ) pi ON pi.variant_id = pv.id
    JOIN categories c ON c.id = p.category_id
    WHERE pv.stock_qty > 0 AND p.status = 'active'
  `);

  return result.rows;
};