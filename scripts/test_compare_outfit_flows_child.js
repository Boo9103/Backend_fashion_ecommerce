require('dotenv').config();
const aiService = require('../services/aiRecommendationService');
const pool = require('../config/db');

const userId = process.env.TEST_USER_ID;
if (!userId) {
  console.error('TEST_USER_ID not set');
  process.exit(2);
}

(async () => {
  try {
    const message = 'Mình cần outfit đi hẹn hò, trời se lạnh, ưu tiên trông nữ tính và ấm áp';
    const opts = { message, maxOutfits: 1, sessionId: null };

    console.log('[test] calling generateOutfitRecommendation with message:', message.slice(0,120));
    const start = Date.now();
    const res = await aiService.generateOutfitRecommendation(userId, 'hẹn hò', 'se lạnh', opts);
    const took = Date.now() - start;

    console.log('[test] raw result summary (took ms):', took);
    console.log(JSON.stringify({
      type: res && res.type,
      outfitsCount: Array.isArray(res.outfits) ? res.outfits.length : 0,
      replyPreview: String(res.reply || res.message || '').slice(0,200),
      ask: !!res.ask
    }, null, 2));

    // gather variant ids and validate existence in DB
    const variantIds = [];
    if (Array.isArray(res.outfits)) {
      for (const o of res.outfits) {
        (o.items || []).forEach(v => { if (v) variantIds.push(String(v)); });
      }
    }

    console.log('[test] total variant_ids returned:', variantIds.length);
    if (variantIds.length === 0) {
      console.log('[test] no variants returned (possible ask/fallback empty)');
      process.exit(0);
    }

    // dedupe
    const unique = Array.from(new Set(variantIds));
    const q = await pool.query(`SELECT id::text FROM product_variants WHERE id::text = ANY($1::text[])`, [unique]);
    const existing = (q.rows || []).map(r => String(r.id));
    const existingSet = new Set(existing);
    const mappedCount = unique.filter(id => existingSet.has(id)).length;

    console.log('[test] variant existence:', { returnedUnique: unique.length, existingInDB: mappedCount });
    console.log('[test] mapping_rate:', (mappedCount / unique.length).toFixed(3));

    // Print full outfits for manual inspection (short)
    console.log('\n--- OUTFITS DETAIL ---');
    if (Array.isArray(res.outfits)) {
      res.outfits.forEach((o, idx) => {
        console.log(`OUTFIT ${idx+1}: name="${o.name}" items=${JSON.stringify(o.items)} why="${String(o.why||'').slice(0,120)}"`);
      });
    } else {
      console.log('No outfits (ask or empty)');
    }

    // close pool and exit
    await pool.end?.() || null;
    process.exit(0);
  } catch (e) {
    console.error('[test child] error', e && (e.stack || e.message) ? (e.stack || e.message) : e);
    try { await pool.end?.(); } catch(_) {}
    process.exit(3);
  }
})();