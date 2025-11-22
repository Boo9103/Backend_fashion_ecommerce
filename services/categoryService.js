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
            'INSERT INTO categories (name, parent_id, image) VALUES ($1, $2, $3) RETURNING id, name, parent_id, image',
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

const updateCategory = async (id, { name, parent_id, image }) => {

    const existing = await pool.query('SELECT id FROM categories WHERE id = $1', [id]);
    if (existing.rowCount === 0) throw new Error('Category not found');

    if (!name || typeof name !== 'string' || name.trim() === '') {
        throw new Error('Name is required');
    }
    // if(image !== undefined && (!image || image.trim() === '')){
    //     throw new Error('Image is required');
    // }
    if (parent_id && String(parent_id) === String(id)) {
        throw new Error('parent_id cannot equal id');
    }
    if (parent_id) {
        const chk = await pool.query('SELECT id FROM categories WHERE id = $1', [parent_id]);
        if (chk.rowCount === 0) throw new Error('Invalid parent_id');
    }

    const result = await pool.query(
    `UPDATE categories
        SET name = $1, parent_id = $2, image = $3, updated_at = NOW()
        WHERE id = $4
        RETURNING id, name, parent_id, image, updated_at`,
    [name.trim(), parent_id || null, image || null, id]
    );
    return result.rows[0];
};

const deleteCategory = async (id, cascade = false)=>{
    const client = await pool.connect();
    try{
        await client.query('BEGIN');
        //Kiểm tra sub-categories
        const checkSub = await client.query('SELECT id FROM categories WHERE parent_id = $1', [id]);
        if(checkSub.rows.length > 0 ){
            if(!cascade) throw new Error('Category has sub-categories.');
            //Nếu cascade = true, xóa tất cả sub-categories trước
            await client.query('DELETE FROM categories WHERE parent_id = $1', [id]);
        
        }
        //Xóa category cha
        const result = await client.query('DELETE FROM categories WHERE id = $1', [id]);
        if(result.rowCount===0) throw new Error('Category not found');
        await client.query('COMMIT');
        return;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};


module.exports = {
    createCategory,
    updateCategory,
    deleteCategory
};
