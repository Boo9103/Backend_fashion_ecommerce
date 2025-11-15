const util = require('util');

module.exports = (err, req, res, next) => {
    try {
        console.error('[errorHandler] failure', err && (err.stack || err.message || err));

        // If headers already sent, do not attempt to set headers / send response again.
        if (res.headersSent) {
            // log and terminate silently (Express will handle)
            console.error('[errorHandler] headers already sent, cannot send error response');
            return;
        }

        const status = err.status || 500;
        const payload = {
            success: false,
            message: err.message || 'Internal Server Error'
        };

        // include more debug info in non-production
        if (process.env.NODE_ENV !== 'production') {
            payload.error = err.stack || err;
        }

        res.status(status).json(payload);
    } catch (handlerErr) {
        // last resort - avoid crashing the process
        console.error('[errorHandler] failed to send error response', handlerErr);
    }
};
