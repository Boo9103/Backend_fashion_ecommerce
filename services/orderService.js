const pool = require('../config/db');

exports.updateOrderStatus = async ({ userId, role, orderId, status, cancel_reason})=> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        //Kiểm tra trạng thái hợp lệ
        const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status)){
            throw new Error('Invalid order status');
        }

        //Lấy thông tin đơn hàng hiện tại
        const orderCheck = await client.query(`
            SELECT id, user_id, order_status
            FROM orders
            WHERE id = $1
        `, [orderId]);

        if(orderCheck.rowCount === 0){
            return null;
        }

        if (role !== 'admin') {
            throw new Error('Access denied');
        }

        const currentOrder = orderCheck.rows[0];
        const currentStatus = currentOrder.order_status;

        // Nếu set thành 'cancelled', xử lý logic hủy
        if (status === 'cancelled') {
        // Không hoàn stock nếu đã delivered
            if (currentStatus !== 'delivered') {
                // Hoàn lại stock nếu chưa delivered
                const items = await client.query(
                    `SELECT variant_id, qty FROM order_items WHERE order_id = $1`,
                    [orderId]
                );

                for (const item of items.rows) {
                    await client.query(
                        `UPDATE product_variants 
                        SET stock_qty = stock_qty + $1, sold_qty = COALESCE(sold_qty, 0) - $1
                        WHERE id = $2`,
                        [item.qty, item.variant_id]
                    );
                }
            }
            // Lưu cancel_reason (tùy chọn từ body)
            const reasonToUse = cancel_reason !== undefined ? cancel_reason : null;
            const updateQuery = `
                UPDATE orders
                SET order_status = $1, updated_at = NOW(), cancel_reason = $3
                WHERE id = $2
                RETURNING *
            `;
            const updateRes = await client.query(updateQuery, [status, orderId, reasonToUse]);
            await client.query('COMMIT');
            return updateRes.rows[0];
        }

        if(status === 'delivered'){
            const updateRes = await client.query(`
                UPDATE orders
                SET order_status = $1, payment_status = 'paid', updated_at = NOW()
                WHERE id = $2
                RETURNING *
            `, [status, orderId]);

            await client.query('COMMIT');
            return updateRes.rows[0];
        }
        //Cập nhật trạng thái
        const updateRes = await client.query(`
            UPDATE orders
            SET order_status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *
        `, [status, orderId]);

        await client.query('COMMIT');

        return updateRes.rows[0];

    }catch (error){
        await client.query('ROLLBACK');
        throw error;
    }finally{
        client.release();
    }
};