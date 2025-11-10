const userService = require('../../services/userProfileServices');

exports.getUserById = async (req, res ,next) => {
    try {
        const user = await userService.getUserById(req.user.id);
        return res.json(user);
    } catch (error) {
        next(error);
    }
};

exports.updateUserProfile = async (req, res, next) => {
    try {
        const data = {
            full_name: req.body.full_name,
            phone: req.body.phone,
            name: req.body.name
        };

        const updatedUser = await userService.updateUserProfile(req.user.id, data);
        return res.json({ user: updatedUser });
    } catch (error) {
        next(error);
    }
};

exports.getAddresses = async (req, res, next) => {
    try {
        const addrs = await userService.getUserAddresses(req.user.id);
        return res.json({ addresses: addrs });
    } catch (error) {
        next(error);
    }
};

exports.addAddress = async (req, res, next) => {
    try {
        const payload = {
            receive_name: req.body.receive_name,
            phone: req.body.phone,
            address: req.body.address,
            is_default: req.body.is_default || false, // mặc định là false nếu không cung cấp
            tag: req.body.tag || null
        };

        const addr = await userService.addUserAddress(req.user.id, payload);
        return res.status(201).json({ address: addr });
    } catch (error) {
        next(error);
    }
};

exports.updateAddress = async (req, res, next) => {
    try {
        const addressId = req.params.id;
        const payload = {
            receive_name: req.body.receive_name,
            phone: req.body.phone,
            address: req.body.address,
            is_default: req.body.is_default || false,
            tag: req.body.tag || null
        };

        const addr = await userService.updateUserAddress(req.user.id, addressId, payload);
        return res.status(200).json({ address: addr });
    } catch (error) {
        next(error);    
    }
};

exports.deleteAddress = async(req, res, next) => {
    try{
        const addressId = req.params.id;
        const ok = await userService.deleteUserAddress(req.user.id, addressId);
        if (!ok) return res.status(404).json({ message: 'Address not found' });
        return res.status(200).json({ message: 'Address deleted successfully' });
    } catch (error) {
        next(error);
    }
};

exports.getAddressById = async (req, res, next) => {
    try {
        const addressId = req.params.id;
        const addr = await userService.getUserAddress(req.user.id, addressId);
        if(!addr) return res.status(404).json({ message: 'Address not found' });
        return res.status(200).json({ address: addr });
    } catch (error) {
        next(error);
    }
};

exports.setDefaultAddress = async(req, res, next) => {
    try {
        const addressId = req.params.id;
        const addr = await userService.setDefaultAddress(req.user.id, addressId);
        if(!addr) return res.status(404).json({ message: 'Address not found or does not belong to user' });
        return res.status(200).json({ message: 'Default address set successfully', address: addr });
    } catch (error) {
        next(error);
    }
};