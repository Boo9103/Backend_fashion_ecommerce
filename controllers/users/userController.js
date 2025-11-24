const userService = require('../../services/userProfileServices');

exports.getUserById = async (req, res ,next) => {
    try {
        const user = await userService.getUserById(req.user.id);
        return res.json(user);
    } catch (error) {
        next(error);
    }
};

exports.getUserByInputId = async (req, res, next) => {
    try {
        const userId = req.params.userId;
        const user = await userService.getUserById(userId);
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
        const userId = req.user?.id;
        const addrs = await userService.getUserAddresses(userId);
        return res.json({
            success: true,
            data: addrs,    
            message: addrs.length ? 'Addresses retrieved successfully' : 'No addresses found' });
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
        const addr = await userService.getUserAddressById(req.user.id, addressId);
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

exports.deleteAccount = async (req, res, next) => {
    try{
        const ok = await userService.deleteUserAccount(req.user.id);
        if(!ok) return res.status(400).json({ message: 'User not found'});

        return res.status(200).json({ message: 'User account deleted successfully' });
    } catch (error) {
        next(error);
    }
};

exports.deactivateAccount = async(req, res, next) => {
    try {
        const userId = req.user && req.user.id;
        if(!userId){
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const updated = await userService.deactivateUserAccount(userId);
        if(!updated){
            return res.status(400).json({ message: 'User not found' });
        }

        //Fe nên xóa token local và redirect/ show message
        return res.status(200).json({ message: 'User account deactivated successfully' });
    } catch (error) {
        next(error);
    }
};

exports.updateUserMeasurement = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        const { height, weight, bust, waist, hip } = req.body;
        const updated = await userService.updateUserMeasurement(userId, { height, weight, bust, waist, hip });
        return res.status(200).json({ message: 'User measurements updated successfully', measurement: updated });
    } catch (error) {
        next(error);
    }
};

exports.getUserMeasurement = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }  
        const measurement = await userService.getUserMeasurement(userId);
        return res.status(200).json({ measurement });
    } catch (error) {
        next(error);
    }
};