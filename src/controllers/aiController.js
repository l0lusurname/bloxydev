const { generateLuaCode } = require('../services/aiService');
const logger = require('../utils/logger');

const generateCode = async (req, res, next) => {
    try {
        const { prompt, gameTree, requestSize = 'medium' } = req.body;
        
        // Generate code using AI
        const generatedCode = await generateLuaCode(prompt, gameTree, requestSize);
        
        res.json({
            success: true,
            data: generatedCode
        });
    } catch (error) {
        logger.error('Error generating code:', error);
        next(error);
    }
};

module.exports = {
    generateCode
};