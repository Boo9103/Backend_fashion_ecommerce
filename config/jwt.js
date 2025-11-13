const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const generateToken = (user)=> {
    // console.table(user);
    return jwt.sign(
        {
            id: user.id, 
            email: user.email, 
            role: user.role,
            full_name: user.full_name,
            name: user.name,
            phone: user.phone,
        },
        process.env.JWT_SECRET,
        { expiresIn: '15s'}
    );
};

const verifyToken = (token) => {
    try{
        return jwt.verify(token, process.env.JWT_SECRET);
    }catch(error){
        throw new Error('Invalid or expired token');
    }
};

const generateFreshToken = ()=>{
    return crypto.randomBytes(40).toString('hex'); //tạo chuỗi randoom có 80 ký tự
};

module.exports = {generateToken, verifyToken, generateFreshToken};
