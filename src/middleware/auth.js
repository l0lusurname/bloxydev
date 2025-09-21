const logger = require('../utils/logger');

const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Missing or invalid Authorization header');
        return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    if (token !== process.env.AI_GATEWAY_KEY) {
        logger.warn('Invalid API key');
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
    }

    next();
};

module.exports = authenticate;