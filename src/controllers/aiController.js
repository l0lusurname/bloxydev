const { generateLuaCode, processAIRequest } = require('../services/aiService');
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

const handleChat = async (req, res, next) => {
    try {
        const { message } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Message is required'
            });
        }

        // Process the AI request and generate user-friendly response
        const aiResponse = await processAIRequest(message);
        
        res.json({
            success: true,
            response: aiResponse
        });
    } catch (error) {
        logger.error('Error processing chat request:', error);
        next(error);
    }
};

module.exports = {
    generateCode,
    handleChat
};