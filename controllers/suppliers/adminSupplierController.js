const pool = require('../../config/db');
const validator = require('validator');
const supplierService = require('../../services/supplierService');

exports.createSupplier = async (req, res) => {
  console.log('createSupplier - req.body =', req.body);
  try {
    const { name, contact_email, phone, logo_url } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (contact_email && !validator.isEmail(contact_email)) {
      return res.status(400).json({ message: 'Invalid contact email' });
    }
    if (phone && !validator.isMobilePhone(phone, 'vi-VN')) {
      return res.status(400).json({ message: 'Invalid phone number' });
    }
    const newSupplier = await supplierService.createSupplier({ name, contact_email, phone, logo_url});
    return res.status(200).json({ message: 'Supplier created successfully', supplier: newSupplier });
  }catch (error) {
    console.error('UpdateSupplier error:', error);
    if(error.message === 'Supplier not found'){
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.updateSupplier = async (req, res) => {
  try{
    const { id } = req.params;
    const { name, contact_email, phone, logo_url } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (contact_email && !validator.isEmail(contact_email)) {
      return res.status(400).json({ message: 'Invalid contact email' });
    }
    if (phone && !validator.isMobilePhone(phone, 'vi-VN')) {
      return res.status(400).json({ message: 'Invalid phone number' });
    }

    const updatedSupplier = await supplierService.updateSupplier(id, { name, contact_email, phone, logo_url });
    return res.status(200).json({ message: 'Supplier updated successfully', supplier: updatedSupplier });
  }catch (error) {
    console.error('updateSupplier error:', error);
    if (error.message === 'Supplier not found') {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

exports.deleteSupplier = async (req, res) => {
  try{
    const { id } = req.params;
    const deletedSupplier = await supplierService.deleteSupplier(id);
    return res.status(200).json({ message: 'Supplier deleted successfully', supplier: deletedSupplier });
  }catch (error) {
    console.error('deleteSupplier error:', error);
    if (error.message === 'Supplier not found' || error.message === 'Supplier has associated products') {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
};

exports.getSupplier = async (req, res)=> {
  try{
    const suppliers = await supplierService.getSuppliers();
    return res.status(200).json({ message: 'Suppliers retrieved successfully', suppliers});
  }catch(error){
    console.error('getSuppliers error:', error);
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    })
  }
};

exports.getSupplierById = async (req, res)=>{
  try{
    const { id } = req.params;
    const supplier = await supplierService.getSupplierById(id);
    if(!supplier){
      return res.status(404).json({ message: 'Supplier not found'});
    }
    return res.status(200).json({ message: 'Supplier retrieved successfully', supplier});
  
  }catch(error){
    console.error('getSupplierById error:', error);
    return res.status(500).json({
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    })
  }
};