const Joi = require('joi');
const logger = require('../utils/logger');

const gameTreeSchema = Joi.object({
    Workspace: Joi.object().required(),
    StarterGui: Joi.object(),
    ReplicatedStorage: Joi.object(),
    ServerStorage: Joi.object(),
    Players: Joi.object(),
    Lighting: Joi.object()
});

const aiRequestSchema = Joi.object({
    prompt: Joi.string().required(),
    gameTree: gameTreeSchema.required(),
    requestSize: Joi.string().valid('small', 'medium', 'large').default('medium')
});

const validateAIRequest = async (req, res, next) => {
    try {
        await aiRequestSchema.validateAsync(req.body);
        next();
    } catch (error) {
        logger.error('AI request validation error:', error);
        error.type = 'validation';
        next(error);
    }
};

const validateGameTree = async (req, res, next) => {
    try {
        const { gameTree } = req.body;
        await gameTreeSchema.validateAsync(gameTree);
        next();
    } catch (error) {
        logger.error('Game tree validation error:', error);
        error.type = 'validation';
        next(error);
    }
};

module.exports = {
    validateAIRequest,
    validateGameTree
};