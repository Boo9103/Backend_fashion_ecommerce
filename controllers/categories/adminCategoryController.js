const pool = require ('../../config/db');
const categoryService = require('../../services/categoryService');

exports.getCategories = async (req, res) => {
  let client;
  try {
    client = await pool.connect();
    const result = await client.query('SELECT id, name, parent_id, image FROM categories');
    return res.status(200).json({ categories: result.rows });
  } catch (error) {
    console.error('getCategories error:', error);
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  } finally {
    if (client) client.release();
  }
};

exports.createCategory = async (req, res) => {
  try {
    const categoryData = req.body;
    const newCategory = await categoryService.createCategory(categoryData);
    return res.status(201).json({ message: 'Category created successfully', category: newCategory });
  } catch (error) {
    console.error('createCategory error:', error);
    if (error.message === 'Name is required' || error.message === 'Invalid parent_id') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id, image } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res
        .status(400)
        .json({ message: 'Name is required and must be a non-empty string' });
    }

    const updatedCategory = await categoryService.updateCategory(id, {
      name,
      parent_id,
      image,
    });
    return res.status(200).json({
      message: 'Category updated successfully',
      category: updatedCategory,
    });
  } catch (error) {
    console.error('updateCategory error:', error);
    if (
      error.message === 'Category not found' ||
      error.message === 'Invalid parent_id' ||
      error.message === 'parent_id cannot equal id' ||
      error.message === 'Name is required'
    ) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {},
    });
  }
};

exports.deleteCategory = async (req, res) =>{
  try {
    const { id } = req.params;
    const { cascade } = req.query; //Lấy param cascade từ query string

    const deleteCategory = await categoryService.deleteCategory(id, cascade === 'true');
    return res.status(200).json({ message: 'Category deleted successfully', category: deleteCategory });
  }catch(error){
    console.error('deleteCategory error:', error);
    if(error.message === 'Category has sub-categories'){
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};