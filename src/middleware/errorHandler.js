const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    logger.error(err.stack);

    if (err.type === 'validation') {
        return res.status(400).json({
            error: 'Validation Error',
            details: err.details
        });
    }

    if (err.type === 'credits') {
        return res.status(402).json({
            error: 'Insufficient Credits',
            details: err.message
        });
    }

    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' 
            ? 'An unexpected error occurred' 
            : err.message
    });
};

module.exports = { errorHandler };