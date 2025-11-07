const promotionService = require('../../services/promotionServices');

exports.createPromotion = async (req, res)=>{
    try{
        const { 
            code, name, description, type, value,
            min_order_value, max_discount_value,
            start_date, end_date, usage_limit, 
            status = 'active', product_ids = []
        } = req.body;

        if(product_ids !== null && !Array.isArray(product_ids)){
            return res.status(400).json({ error: 'product_ids must be an array or null' });
        }

        //Validate
        if (!code || !name || !type || !value || !start_date || !end_date){
            return res.status(400).json({ error: 'code, name, type, value, start_date, end_date are required' });
        }

        if(new Date(start_date) >= new Date(end_date)){
            return res.status(400).json({ error: 'start_date must be before end_date' });
        }

        if(!['percentage', 'fixed', 'free_ship'].includes(type)){
            return res.status(400).json({ error: 'type must be percentage, fixed, or free_ship' });
        }

        if(value <= 0){
            return res.status(400).json({ error: 'value must be greater than 0' });
        }

        const promotion = await promotionService.createPromotion({
            code: code.trim().toUpperCase(), 
            name: name.trim(), 
            description, type, 
            value: parseFloat(value),
            min_order_value: min_order_value ? parseFloat(min_order_value) : null, 
            max_discount_value: max_discount_value ? parseFloat(max_discount_value) : null,
            start_date, end_date, 
            usage_limit: usage_limit ? parseInt(usage_limit):null, 
            status, product_ids
        });

        return res.status(201).json({
            message: 'Promotion created successfully',
            promotion
        });
    }catch (error){
        if (error.message.includes('already exists')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getPromotions = async (req, res)=>{
    const { status, type, code, page = 1, limit = 10 } = req.query;

    try{
        const filters = {
            status: status || undefined,
            type: type || undefined,
            code: code ? code.toUpperCase() : undefined,
            page: parseInt(page),
            limit: parseInt(limit)
        };

        const { promotions, total } = await promotionService.getPromotions(filters);

        return  res.status(200).json({
            promotions,
            pagination: {
                total,
                page: filters.page,
                limit: filters.limit,
                totalPages: Math.ceil(total/filters.limit)
            }
        });
    }catch (error){
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getPromotionById = async (req, res)=> {
    const { id } = req.params;

    try {
        const promotion = await promotionService.getPromotionById(id);
        if(!promotion){
            return res.status(404).json({ message: 'Promotion not found' });
        }

        return res.status(200).json({ promotion });
    }catch (error){
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.updatePromotion = async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;

    try {
        //Không cho phép đổi code nếu đã dùng (used_count > 0)
        if (updateData.code){
            const promo = await promotionService.getPromotionById(id);
            if(promo.used_count > 0){
                return res.status(400).json({ message: 'Cannot change code of used promotion'});
            }
        }

        const updated = await promotionService.updatePromotion(id, updateData);

        return res.json({
            message: 'Promotion updated successfully',
            promotion: updated
        });
    }catch (error) {
        if (error.message.includes('not found')) {
            return res.status(404).json({ message: error.message });
        }
        if (error.message.includes('already exists')) {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: error.message });
    }
};

exports.deletePromotion = async (req, res) => {
    const { id } =req.params;

    try{
        const deleted = await promotionService.deletePromotion(id);
        return res.json({
            message: 'Promotion deleted successfully',
            promotion: deleted
        })
    }catch (error){
        if (error.message === 'Promotion not found') {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Server error', error: error.message });
  }
};


// controllers/adminPromotionController.js
exports.updatePromotionStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Status must be active or inactive' });
    }

    const updated = await promotionService.updatePromotionStatus(id,{ status });

    return res.json({
      message: `Promotion ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
      promotion: updated
    });
  } catch (error) {
    if (error.message === 'Promotion not found') {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({ message: error.message });
  }
};
