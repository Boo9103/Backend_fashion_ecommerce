const pool = require('../config/db');
const {
  validatePrice,
  validateStockQty,
  validateSalePercent,
  validateSoldQuantity
} = require('../utils/validate');

// Returns products. Default behavior: only return products with status = 'active' unless
// caller passes `status` explicitly. To return all statuses, pass status = 'all'.
exports.getProducts = async ( {search_key, category_id, supplier_id, is_flash_sale, min_price, max_price, status, limit = 10, page = 1})=>{
  const offset = (page-1)*limit;
  let query = `SELECT * FROM v_product_full p`;
  const conditions = [];
  const params = [];

  // 0. Lọc theo key search (tên sản phẩm)
  if (search_key) {
    // Postgres uses ILIKE for case-insensitive pattern matching
    conditions.push(`p.name ILIKE $${params.length + 1}`);
    params.push(`%${search_key}%`);
  }
  // 1. Lọc category
  if (category_id) {
    conditions.push(`p.category_id = $${params.length + 1}`);
    params.push(category_id);
  }
  // 2. Lọc supplier
  if (supplier_id) {
    conditions.push(`p.supplier_id = $${params.length + 1}`);
    params.push(supplier_id);
  }
  // 2.5 Lọc theo trạng thái sản phẩm
  // Nếu caller không truyền `status` thì mặc định chỉ lấy 'active'.
  if (typeof status === 'undefined') {
    conditions.push(`p.status = $${params.length + 1}`);
    params.push('active');
  } else if (status !== 'all') {
    // Nếu status = 'all' thì không lọc theo status
    conditions.push(`p.status = $${params.length + 1}`);
    params.push(status);
  }
  // 3. Lọc flash sale
  if (is_flash_sale !== undefined) {
    conditions.push(`p.is_flash_sale = $${params.length + 1}`);
    params.push(is_flash_sale);
  }
  // 4. Lọc theo giá (final_price)
  if (min_price !== undefined) {
    conditions.push(`p.final_price >= $${params.length + 1}`);
    params.push(min_price);
  }
  if (max_price !== undefined) {
    conditions.push(`p.final_price <= $${params.length + 1}`);
    params.push(max_price);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  // 5. Phân trang
  query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  // Debug log
  console.log('[getProducts] Query:', query);
  console.log('[getProducts] Params:', params);

  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('[getProducts] ERROR:', err && err.stack ? err.stack : err);
    throw err;
  }
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
    v.stock_qty = validateStockQty(v.stock_qty);

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
