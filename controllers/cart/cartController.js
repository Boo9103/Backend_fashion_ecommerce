const cartService = require('../../services/userCartService');

exports.getCart = async (req, res, next) => {
    try {
        const userId = req.user && req.user.id;
        if (!userId){
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const cart = await cartService.getCart(userId);
        return res.status(200).json(cart);
    } catch (error) {
        next(error);
    }
};

exports.addItem = async (req, res, next) => {
    try {
        const userId = req.user && req.user.id;
        const { variant_id, qty, size } = req.body || {};
        if(!variant_id) return res.status(400).json({ message: 'variant_id is required' });
        if(qty !== undefined && isNaN(Number(qty))) {
            return res.status(400).json({ message: 'qty must be a number' });
        }
        if(size !== undefined && size !== null && typeof size !== 'string') {
            return res.status(400).json({ message: 'size must be a string' });
        }
        const cart = await cartService.addItem(userId, variant_id, qty, size);
        return res.status(200).json(cart);
    } catch (error) {
        next(error);
    }
};

exports.updateItem = async(req, res, next) => {
    try {
        const userId = req.user && req.user.id;
        const itemId = req.params.id;
        const { qty } = req.body || {};

        if(qty === undefined) return res.status(400).json({ message: 'qty is required' });

        const cart = await cartService.updateItem(userId, itemId, qty);
        return res.status(200).json(cart);  
    } catch (error) {
        next(error);
    }
};

exports.removeItem = async(req, res, next) => {
    try {
        const userId = req.user && req.user.id;
        const itemId = req.params.id;
        const cart = await cartService.removeItem(userId, itemId);
        return res.status(200).json(cart);
    } catch (error) {
        next(error);
    }
};

exports.clearCart = async (req, res, next) => {
  try {
    const userId = req.user && req.user.id;
    const r = await cartService.clearCart(userId);
    return res.json(r);
  } catch (err) {
    next(err);
  }
};

exports.getProductFromVariant = async (req, res, next) => {
    try {
        const variantId = req.params.variantId;
        if(!variantId) return res.status(400).json({ message: 'variantId is required' });
        const product = await cartService.getProductFromVariant(variantId);
        return res.status(200).json(product);
    } catch (error) {
        next(error);
    }
};