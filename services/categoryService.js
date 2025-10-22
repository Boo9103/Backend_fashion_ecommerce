const pool = require('../config/db');

const createCategory = async ({ name, parent_id, image }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Kiểm tra name bắt buộc
        if (!name || name.trim() === ''){
            throw new Error('Name is required');
        }
        // Kiểm tra parent_id nếu có
        if(parent_id){
            const parentCheck = await client.query('SELECT id FROM categories WHERE id = $1', [parent_id]);
            if(parentCheck.rows.length === 0){
                throw new Error('Invalid parent_id');
            }
        }
        // Insert category
        const result = await client.query(
            'INSERT INTO categories (name, parent_id, image) VALUES ($1, $2, $3) RETURNING id',
            [name, parent_id || null, image]
        );
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    createCategory
};
