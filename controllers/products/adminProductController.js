const { validatePriceRange } = require('../../utils/validate');
const productService = require('../../services/productService');
const e = require('express');

exports.getFlashSaleProducts = async (req, res) => {
    const { category_id, supplier_id, limit, page, flash_sale, min_price, max_price } = req.query;

    const { min, max } = validatePriceRange(min_price, max_price);

    const filters = {
        category_id,
        supplier_id,
        limit: parseInt(limit) || 10,
        page: parseInt(page) || 1,
        is_flash_sale: flash_sale === 'true' ? true : flash_sale === 'false' ? false : undefined,
        min_price: min,
        max_price: max,
    };

    try {
        const products = await productService.getProducts(filters);
        return res.json({ products, total: products.length });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

exports.createProduct = async (req, res) => {
    try {
        const {
            name, description, category_id, supplier_id,
            price, sale_percent = 0, is_flash_sale = false,
            images = [], variants = []
        } = req.body;


        //Validate required fields
        if (!name || !category_id || !supplier_id || !price) {
            return res.status(400).json({ message: 'Name, category_id, supplier_id, price are required' });
        }

        if (sale_percent < 0 || sale_percent > 100) {
            return res.status(400).json({ message: 'sale_percent must be 0-100' });
        }

        if (variants && variants.length > 0) {
            const skus = variants.map(v => v.sku).filter(Boolean);
            if (skus.length !== variants.length) {
                return res.status(400).json({ message: 'All variants must have SKU' });
            }
            const duplicateSkus = skus.filter((sku, idx) => skus.indexOf(sku) !== idx);
            if (duplicateSkus.length > 0) {
                return res.status(400).json({ message: `Duplicate SKUs: ${duplicateSkus.join(', ')}` });
            }
        }

        const newProduct = await productService.createProduct({
            name, description, category_id, supplier_id,
            price, sale_percent, is_flash_sale,
            images, variants
        });

        return res.status(201).json({
            message: 'Product created successfully',
            product: newProduct
        });
    } catch (error) {
        console.error('createProduct error:', error && error.stack ? error.stack : error);
        const status = error.statusCode && Number.isInteger(error.statusCode) ? error.statusCode : 500;
        return res.status(status).json({
            message: status === 500 ? 'Server error' : error.message,
            error: process.env.NODE_ENV === 'development' ? (error.message || error) : {}
        });
    }
};

exports.updateFlashSale = async (req, res) => {
    const { id } = req.params;
    const { sale_percent, is_flash_sale } = req.body;

    if (sale_percent < 0 || sale_percent > 100) {
        return res.status(400).json({ message: 'sale_percent must be 0-100' });
    }

    try {
        const updated = await productService.updateFlashSale(id, { sale_percent, is_flash_sale });
        return res.status(200).json({ message: 'Flash sale updated', product: updated });
    } catch (error) {
        if (error.message.includes('sale_percent must be greater than 0')) {
            return res.status(400).json({ message: error.message });
        }
        if (error.message === 'Cannot enable flash sale with 0% discount') {
            return res.status(400).json({ message: 'Discount must be greater than 0% for flash sale' });
        }
        return res.status(400).json({ message: error.message });
    }
};

exports.updateProduct = async (req, res) => {
    const { id } = req.params;
    const data = req.body;

    // BẮT BUỘC name và price
    if (!data.name || !data.price) {
        return res.status(400).json({
            message: 'name and price are required'
        });
    }

    try {
        const updated = await productService.updateProduct(id, data);
        return res.status(200).json({ message: 'Product updated successfully', product: updated });
    } catch (error) {
        return res.status(400).json({ message: error.message || 'Update product failed' });
    }
};

exports.deleteProduct = async (req, res) => {
    const { id } = req.params;

    try {
        await productService.deleteProduct(id);
        return res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
        return res.status(400).json({ message: error.message || 'Delete product failed' });
    }
};

exports.getProductById = async (req, res) => {
    const { id } = req.params;
    try {
        const product = await productService.getProductById(id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        return res.status(200).json(product);
    } catch (error) {
        console.error('getProduct error:', error && error.stack ? error.stack : error);
        return res.status(500).json({ message: 'Server error' });
    }
};