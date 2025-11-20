const aiService = require('../services/aiRecommendationService');

exports.getAIOutfits = async (req, res) => {
    try {
        const userId = req.user?.id; 
        const { occasion = "đi chơi", weather = "25°C, nắng đẹp" } = req.body;

        const outfits = await aiService.generateOutfitRecommendation(userId, occasion, weather);

        res.json({
        success: true,
        message: "Luna đã mix đồ xong cho bạn rồi nè! ✨",
        data: outfits
        });
    } catch (error) {
        res.status(500).json({
        success: false,
        message: "Luna đang bận thử đồ, thử lại sau nha!",
        error: error.message
        });
    }
};