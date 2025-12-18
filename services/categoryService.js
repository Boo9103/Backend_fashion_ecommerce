const pool = require('../config/db');
// simple slugify (remove diacritics, lower, spaces -> hyphen, keep alnum and hyphen)
const slugify = (s) => s.toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .toLowerCase().trim()
    .replace(/[^a-z0-9\s\-\/]/g, '') // allow slash for nested slug construction
    .replace(/\s+/g, '-')
    .replace(/\-+/g, '-');

const createCategory = async ({ name, parent_id, image }) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Kiểm tra name bắt buộc
        if (!name || name.trim() === ''){
            throw new Error('Name is required');
        }

        const nameSlug = slugify(name);
        let finalSlug = nameSlug;

        // Kiểm tra parent_id nếu có
        if(parent_id){
            const parentCheck = await client.query('SELECT id, slug, name FROM categories WHERE id = $1', [parent_id]);
            if(parentCheck.rows.length === 0){
                throw new Error('Invalid parent_id');
            }
            const parentSlug = parentCheck.rows[0].slug || slugify(parentCheck.rows[0].name || '');
            finalSlug = parentSlug ? `${parentSlug}/${nameSlug}` : nameSlug;
        }

        // ensure unique slug (append -1, -2... if needed)
        let uniqueSlug = finalSlug;
        let suffix = 1;
        while (true) {
            const exist = await client.query('SELECT id FROM categories WHERE slug = $1', [uniqueSlug]);
            if (exist.rows.length === 0) break;
            uniqueSlug = `${finalSlug}-${suffix++}`;
        }
        // Insert category
        const result = await client.query(
            'INSERT INTO categories (name, parent_id, image, slug) VALUES ($1, $2, $3, $4) RETURNING id, name, parent_id, image, slug',
            [name.trim(), parent_id || null, image, uniqueSlug]
        );
        await client.query('COMMIT');
        return result.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally { 
        client.release();
    }
}

const updateCategory = async (id, { name, parent_id, image }) => {
    const client = await pool.connect();
    try {
        const existingRes = await pool.query('SELECT id FROM categories WHERE id = $1', [id]);
        if (existingRes.rowCount === 0) throw new Error('Category not found');
        const existing = existingRes.rows[0];
        
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
            const chk = await pool.query('SELECT id, slug, name FROM categories WHERE id = $1', [parent_id]);
            if (chk.rowCount === 0) throw new Error('Invalid parent_id');
        }

        const nameSlug = slugify(name);
        let finalSlug = nameSlug;

        if(parent_id){
            const parentRow = await client.query('SELECT id, slug, name FROM categories WHERE id = $1', [parent_id]);
            const parentSlug = parentRow.rows[0].slug || slugify(parentRow.rows[0].name || '');
            finalSlug = parentSlug ? `${parentSlug}/${nameSlug}` : nameSlug;
        }else if (existing.parent_id) {
            // keep no-parent but existing had parent -> use empty parent
            finalSlug = nameSlug;
        } else {
            finalSlug = nameSlug;
        }

        // ensure unique slug excluding current id
        let uniqueSlug = finalSlug;
        let suffix = 1;
        while (true) {
            const exist = await client.query('SELECT id FROM categories WHERE slug = $1 AND id != $2', [uniqueSlug, id]);
            if (exist.rows.length === 0) break;
            uniqueSlug = `${finalSlug}-${suffix++}`;
        }

        const updateRes = await client.query(
            `UPDATE categories
             SET name = $1, parent_id = $2, image = $3, slug = $4, updated_at = NOW()
             WHERE id = $5
             RETURNING id, name, parent_id, image, slug, updated_at`,
            [name.trim(), parent_id || null, image || null, uniqueSlug, id]
        );
        const updated = updateRes.rows[0];

        if (existing.slug && existing.slug !== uniqueSlug) {
            // Use recursive CTE to update descendant slugs that start with old slug + '/'
            // new_slug = new_prefix || substring(old_slug, length(old_prefix)+1)
            await client.query(
                `WITH descendants AS (
                    SELECT id, slug FROM categories
                    WHERE slug LIKE $1
                )
                UPDATE categories c
                SET slug = $2 || substring(c.slug from $3)
                FROM descendants d
                WHERE c.id = d.id`,
                [existing.slug + '/%', uniqueSlug, (existing.slug.length + 1)]
            );
        }

        await client.query('COMMIT');
        return updated;
    }catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
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
