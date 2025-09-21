const Joi = require('joi');
const logger = require('../utils/logger');

const gameTreeSchema = Joi.object({
    gameTree: Joi.object({
        Workspace: Joi.object().required(),
        StarterGui: Joi.object(),
        ReplicatedStorage: Joi.object(),
        ServerStorage: Joi.object(),
        Players: Joi.object(),
        Lighting: Joi.object()
    }).required()
});

const validateGameTree = async (req, res, next) => {
    try {
        await gameTreeSchema.validateAsync(req.body);
        next();
    } catch (error) {
        logger.error('Game tree validation error:', error);
        error.type = 'validation';
        next(error);
    }
};

module.exports = {
    validateGameTree
};