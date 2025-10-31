// const pool = require('../config/db');

// exports.createPromotion = async (data)=>{
//     const {
//         code, name, description, type, value,
//         min_order_value, max_discount_value,
//         start_date, end_date, usage_limit, status,
//         product_ids = null // = null -> áp dụng cho toàn bộ sản phẩm
//     } = data;

//     const client = await pool.connect();

//     try{
//         await client.query('BEGIN');

//         //Kiểm tra code trùng
//         const codeCheck = await client.query('SELECT id FROM promotions WHERE code = $1', [code]);
//         if (codeCheck.rowCount > 0){
//             throw new Error('Promotion code already exists');
//         }

//         //Insert promotion
//         const promoRes = await client.query(
//             `INSERT INTO promotions
//             (code, name, description, type, value, min_order_value, max_discount_value,
//              start_date, end_date, usage_limit, status)
//              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
//              RETURNING id, code, name, type, value,status, start_date, end_date, usage_limit, used_count`,
//              [
//                 code, name, description, type, value,
//                 min_order_value, max_discount_value,
//                 start_date, end_date, usage_limit, status
//              ]
//         );

//         const promoId = promoRes.rows[0].id;


//         //Xử lý product_ids 
//         if( Array.isArray(product_ids) && product_ids.length > 0){

//             //Áp dụng cho danh sách cụ thể
//             const placeholders = product_ids.map((_, i)=> `$${i+1}`).join(', ');
//             const params = [promoId, ...product_ids]
//             await client.query(
//                 `INSERT INTO promotion_products (promotion_id, product_id) VALUES ${placeholders}
//                 ON CONFLICT (promotion_id, product_id) DO NOTHING`,
//                 params
//             );
//         }else if (product_ids === null || product_ids === undefined){
//             //Áp dụng cho tất cả sản phẩm
//             await client.query(
//                 `INSERT INTO promotion_products (promotion_id, product_id)
//                 SELECT $1, id FROM products
//                 ON CONFLICT DO NOTHING`,
//                 [promoId]
//             );
//         }

//          // Nếu product_ids = [] → không làm gì

//         await client.query('COMMIT');

//         //Trả về đầy đủ
//         const full = await client.query(
//             `SELECT p.*,
//                     CASE
//                         WHEN EXISTS (SELECT 1 FROM promotion_products pp WHERE pp.promotion_id = p.id) 
//                         THEN json_agg(pp.product_id)
//                         ELSE NULL
//                     END AS product_ids,
//                     CASE
//                         WHEN NOT EXISTS (SELECT 1 FROM promotion_products WHERE promotion_id = p.id)
//                         THEN 'all_products'
//                         ELSE 'specific'
//                     END AS applies_to
//             FROM promotions p
//             WHERE p.id = $1`,
//             [promoId]
//         );

//         return full.rows[0];
//     }catch (error){
//         await client.query('ROLLBACK');
//         throw error;
//     }finally {
//         client.release();
//     }
// };

const pool = require('../config/db');

exports.createPromotion = async (data) => {
  const {
    code,
    name,
    description,
    type,
    value,
    min_order_value,
    max_discount_value,
    start_date,
    end_date,
    usage_limit,
    status,
    // Quy ước:
    // - null / undefined → áp dụng TẤT CẢ sản phẩm
    // - []               → chưa áp dụng sản phẩm nào (để trống)
    // - [1,2,3]          → áp dụng CHO CÁC SP NÀY
    product_ids = null
  } = data;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    //1. Kiểm tra code trùng
    const codeCheck = await client.query(
      'SELECT id FROM promotions WHERE code = $1',
      [code.trim().toUpperCase()]
    );
    if (codeCheck.rowCount > 0) {
      throw new Error('Promotion code already exists');
    }

    //2. Thêm khuyến mãi vào bảng promotions
    const promoRes = await client.query(
      `INSERT INTO promotions
        (code, name, description, type, value,
         min_order_value, max_discount_value,
         start_date, end_date, usage_limit, status)
       VALUES
        ($1, $2, $3, $4, $5,
         $6, $7,
         $8, $9, $10, $11)
       RETURNING id, code, name, type, value, status,
                 start_date, end_date, usage_limit, used_count`,
      [
        code.trim().toUpperCase(),
        name,
        description,
        type,
        value,
        min_order_value,
        max_discount_value,
        start_date,
        end_date,
        usage_limit,
        status
      ]
    );

    const promoId = promoRes.rows[0].id;

    //3. Xử lý bảng promotion_products
    // ---------------------------------------------------
    // TH1: Có danh sách product cụ thể
    if (Array.isArray(product_ids) && product_ids.length > 0) {
      // Tạo placeholder động: ($1, $2), ($1, $3), ($1, $4)...
      const values = product_ids.map((_, i) => `($1, $${i + 2})`).join(', ');
      const params = [promoId, ...product_ids];

      await client.query(
        `INSERT INTO promotion_products (promotion_id, product_id)
         VALUES ${values}
         ON CONFLICT (promotion_id, product_id) DO NOTHING`,
        params
      );

    // TH2: product_ids === null hoặc undefined → áp dụng cho TẤT CẢ sản phẩm
    } else if (product_ids === null || product_ids === undefined) {
      await client.query(
        `INSERT INTO promotion_products (promotion_id, product_id)
         SELECT $1, id FROM products
         ON CONFLICT (promotion_id, product_id) DO NOTHING`,
        [promoId]
      );
    }

    // TH3: product_ids = [] → không insert gì cả (chưa áp dụng sản phẩm)

    await client.query('COMMIT');

    //4Lấy lại dữ liệu voucher vừa tạo (bao gồm danh sách sản phẩm)
    const full = await client.query(
      `
      SELECT
        p.*,
        -- Lấy mảng product_id nếu có
        (
          SELECT json_agg(pp.product_id)
          FROM promotion_products pp
          WHERE pp.promotion_id = p.id
        ) AS product_ids,
        -- Gắn nhãn kiểu áp dụng
        CASE
          WHEN EXISTS (
            SELECT 1 FROM promotion_products pp2 WHERE pp2.promotion_id = p.id
          ) THEN 'specific'     -- có dòng → áp dụng cho 1 số sp
          ELSE 'all_products'   -- không có dòng → hiểu là all
        END AS applies_to
      FROM promotions p
      WHERE p.id = $1
      `,
      [promoId]
    );

    return full.rows[0];

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};


exports.getPromotions = async ({ status, type, code, page, limit })=> {
    const offset = (page - 1)*limit;

   let query = `
    SELECT 
        p.*,
        CASE 
            WHEN NOT EXISTS (SELECT 1 FROM promotion_products WHERE promotion_id = p.id)
            THEN 'all_products'
            ELSE 'specific'
        END AS applies_to,
        CASE 
            WHEN NOT EXISTS (SELECT 1 FROM promotion_products WHERE promotion_id = p.id)
            THEN (SELECT COUNT(*) FROM products)
            ELSE COUNT(pp.product_id)
        END AS product_count
        FROM promotions p
        LEFT JOIN promotion_products pp ON p.id = pp.promotion_id
    `;
    const params = [];
    let hasWhere = false;

    if(status){
        query += hasWhere ? ` AND P.status = $${params.length + 1}` : `WHERE p.status = $1`;
        params.push(status);
        hasWhere = true;
    }

    if(type){
        query += hasWhere ? ` AND p.type = $${params.length + 1}` : `WHERE p.type = $1`;
        params.push(type);
        hasWhere = true;
    }

    if(code){
        query += hasWhere ? ` AND p.code == $${params.length + 1}` : `WHERE p.code = $1`;
        params.push(code);
        hasWhere = true;    
    }

    query += ` GROUP BY p.id ORDER BY p.created_at DESC`;
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    //Đếm tổng
    let countQuery = `SELECT COUNT(*) FROM promotions p`;
    const countParams = [];
    if(status) countParams.push(status);
    if(type) countParams.push(type);
    if(code) countParams.push(code);
    if(countParams.length > 0){
        countQuery += ` WHERE ` + countParams.map((_, i) => `p.${i === 0 ? 'status' : i === 1 ? 'type' : 'code'} = $${i + 1}`).join(' AND ');
    }
    const countRes = await pool.query(countQuery, countParams);
    const total = parseInt(countRes.rows[0].count, 10);
    return {
        promotions: result.rows,
        total,
    }
};


exports.getPromotionById = async (id)=>{
    const result = await pool.query(
        `SELECT 
                p.*,
                CASE 
                    WHEN NOT EXISTS (SELECT 1 FROM promotion_products WHERE promotion_id = p.id)
                    THEN 'all_products'
                    ELSE 'specific'
                END AS applies_to,
                CASE 
                    WHEN NOT EXISTS (SELECT 1 FROM promotion_products WHERE promotion_id = p.id)
                    THEN (SELECT COUNT(*) FROM products)
                    ELSE COUNT(pp.product_id)
                END AS product_count,
                COALESCE((
                    SELECT json_agg(pp.product_id)
                    FROM promotion_products pp
                    WHERE pp.promotion_id = p.id
                ), '[]'::json) AS product_ids
                FROM promotions p
                LEFT JOIN promotion_products pp ON p.id = pp.promotion_id
                WHERE p.id = $1
                GROUP BY p.id`,
                [id]
    );

    if (result.rowCount === 0) {
        return null;
    }

    const row = result.rows[0];

    return {
        ...row,
        product_count: parseInt(row.product_count),
        // product_ids chỉ trả khi applies_to = "specific"
        product_ids: row.applies_to === 'all_products' ? null : row.product_ids
    };
};

exports.updatePromotion = async (id, data)=>{
    const {
        code, name, description, type, value,
        min_order_value, max_discount_value,
        start_date, end_date, usage_limit, status,
        product_ids
    } = data;

    const client = await pool.connect();

    try{
        await client.query('BEGIN');

        //Kiểm tra tồn tại
        const existCheck = await client.query('SELECT id FROM promotions WHERE id = $1', [id]);
        if(existCheck.rowCount === 0){
            throw new Error('Promotion not found');
        }

        //Nếu đổi code -> kiểm tra trùng
        if(code){
            const codeCheck = await client.query(
                'SELECT id FROM promotions WHERE code = $1 AND id != $2',
                [code.trim().toUpperCase(), id]
            );

            if(codeCheck.rowCount > 0){
                throw new Error('Promotion code already exists');
            }
        }

        //Cập nhật protion
        const fields = [];
        const values = [];
        let idx = 1;

        if (name !== undefined){
            fields.push(`name = $${idx ++}`);
            values.push(name.trim());
        }

        if(description !== undefined){
            fields.push(`description = $${idx ++}`);
            values.push(description);
        }

        if(type !== undefined){
            fields.push(`type = $${idx ++}`);
            values.push(type);
        }

        if(value !== undefined){
            fields.push(`value = $${idx ++}`);
            values.push(parseFloat(value));
        }

        if(min_order_value !== undefined){
            fields.push(`min_order_value = $${idx ++}`);
            values.push(parseFloat(min_order_value));
        }

        if(max_discount_value !== undefined){
            fields.push(`max_discount_value = $${idx ++}`);
            values.push(parseFloat(max_discount_value));
        }

        if(start_date !== undefined){
            fields.push(`start_date = $${idx ++}`);
            values.push(start_date);
        }

        if(end_date !== undefined){
            fields.push(`end_date = $${idx ++}`);
            values.push(end_date);
        }

        if(usage_limit !== undefined){
            fields.push(`usage_limit = $${idx ++}`);
            values.push(parseInt(usage_limit, 10));
        }

        if(status !== undefined){
            fields.push(`status = $${idx ++}`);
            values.push(status);
        }

        if(code !== undefined){
            fields.push(`code = $${idx ++}`);
            values.push(code.trim().toUpperCase());
        }

        fields.push(`updated_at = NOW()`);
        values.push(id);

        if(fields.length === 1){
            throw new Error('No fields to update');
        }

        const updateQuery = `
            UPDATE promotions SET ${fields.join(', ')}
            WHERE id = $${idx}
            RETURNING *`;

        await client.query(updateQuery, values);

        //Cập nhật sản phẩm (xóa cũ, thêm mới)
        if(Array.isArray(product_ids)){
            await client.query(
                'DELETE FROM promotion_products WHERE promotion_id = $1', [id]
            );

        if(product_ids.length > 0){
            const placeholder = product_ids.map((_, i)=> `($1, $${i+2})`).join(',');
            const params = [id, ...product_ids];
            await client.query(
                `INSERT INTO promotion_products (promotion_id, product_id) VALUES ${placeholder}
                ON CONFLICT (promotion_id, product_id) DO NOTHING`,
                params
                );
            }
        }
        await client.query('COMMIT');

        //Trả về dữ liệu mới
        return await this.getPromotionById(id);
    }catch(err){
        await client.query('ROLLBACK');
        throw err;
    }finally{
        client.release();
    }
};

exports.deletePromotion = async(id)=>{
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Kiểm tra tồn tại
        const existCheck = await client.query(
            'SELECT id FROM promotions WHERE id = $1', [id]
        );

        if(existCheck.rowCount === 0){
            throw new Error('Promotion not found');
        }

        //Xóa promotion_products trước
        await client.query(
            'DELETE FROM promotion_products WHERE promotion_id = $1', [id]
        );

        //Xóa promotion 
        const deleteRes = await client.query(
            'DELETE FROM promotions WHERE id = $1', [id]
        );

        await client.query('COMMIT');       
        return deleteRes.rowCount[0]; //Trả về thong tin đã xóa
    }
    catch (error){
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

exports.updatePromotionStatus = async (id, data)=>{
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        //Kiểm tra tồn tại 
        const existCheck = await client.query(
            'SELECT id FROM promotions WHERE id = $1', [id] 
        );
        if (existCheck.rowCount === 0){
            throw new Error('Promotion not found');
        }

        //Cập nhật status 
        const result = await client.query(
            `UPDATE promotions
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *`,
            [data.status, id]
        );

        if (result.rowCount === 0){
            throw new Error('Failed to update promotion status');
        }
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error){
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};