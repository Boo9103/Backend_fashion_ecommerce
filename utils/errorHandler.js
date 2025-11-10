const util = require('util');

const errorHandler = (err, req, res, next) => {
    // If headers already sent, delegate to default Express handler
    if (res.headersSent) {
        return next(err);
    }

    try {
        const isProd = process.env.NODE_ENV === 'production';

        // Normalize non-Error throws (strings, objects, etc.)
        if (!(err instanceof Error)) {
            try {
                err = new Error(typeof err === 'string' ? err : JSON.stringify(err));
            } catch (e) {
                err = new Error(String(err));
            }
        }

        // Generate a lightweight error id to help tracing in logs + responses
        const errorId = `${Date.now().toString(36)}-${Math.floor(Math.random() * 100000)}`;

        // Log full details in dev, minimal in prod
        if (isProd) {
            console.error(`[error:${errorId}]`, err.message);
        } else {
            console.error(`[error:${errorId}]`, err && err.stack ? err.stack : util.inspect(err));
        }

        // Map to HTTP status codes
        let status = 500;
        if (err.status && Number.isInteger(err.status)) status = err.status;
        else if (err.name === 'ValidationError' || err instanceof SyntaxError) status = 400;
        else if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') status = 401;
        else if (err.code === '23505') status = 409; // postgres unique_violation
        else if (err.code === '23503') status = 400; // foreign key violation

        // Response payload
        const payload = {
            message: err.message || 'Internal server error',
            errorId
        };

        // Attach debug info only when not in production
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
    } catch (handlerErr) {
        // If error handler itself fails, fallback safe response
        console.error('[errorHandler] failure', handlerErr && handlerErr.stack ? handlerErr.stack : handlerErr);
        try {
            res.status(500).json({ message: 'Internal server error' });
        } catch (e) {
            // give up if response cannot be sent
        }
    }
};

module.exports = errorHandler;
