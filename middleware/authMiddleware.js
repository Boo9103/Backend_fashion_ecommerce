const jwt = require('jsonwebtoken');

const authMiddleware = (req,res, next)=>{
    const token = req.header('Authorization')?.replace('Bearer', '');
    if(!token){
        return res.status(401).json({ error: 'No token provided'});
    }
    try{
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; //gắn thông tin user vào req(id, email, role)
        next(); // chuyển đến controller
    }catch(error){
        res.status(401).json({error: 'Invalid token'});
    }
};

module.exports = authMiddleware;