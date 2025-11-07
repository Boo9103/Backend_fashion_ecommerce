const crypto = require('crypto');

//Tạo chuỗi cho jwt secret
const jwtSecret = crypto.randomBytes(32).toString('hex');

console.log('Generated JWT_SECRET: ', jwtSecret);
