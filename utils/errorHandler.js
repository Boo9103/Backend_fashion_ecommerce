const errorHandler = (err, req, res, next) => {
    const isProd = process.env.NODE_ENV === 'production';

    // Log lỗi đầy đủ ở server
    console.error(err && err.stack ? err.stack : util.inspect(err));

    // Map lỗi sang HTTP status
    let status = 500;
    if (err.status && Number.isInteger(err.status)) status = err.status;
    else if (err.name === 'ValidationError') status = 400;
    else if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') status = 401;
    else if (err.code === '23505') status = 409; // postgres unique_violation
    else if (err.code === '23503') status = 400; // foreign key violation

    const payload = {
        message: err.message || 'Internal server error'
    };

    // Thêm thông tin chi tiết khi không phải production
    if (!isProd) {
        payload.error = {
            name: err.name,
            message: err.message,
            stack: err.stack,
            code: err.code,
            detail: err.detail,
            hint: err.hint
        };
    }

    res.status(status).json(payload);
};

module.exports = errorHandler;
