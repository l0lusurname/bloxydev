const axios = require('axios');
const logger = require('../utils/logger');

const aiGatewayUrl = process.env.AI_GATEWAY_URL;
const aiGatewayKey = process.env.AI_GATEWAY_KEY;

const generateLuaCode = async (prompt, gameTree, requestSize) => {
    try {
        // Call your AI gateway
        const response = await axios.post(aiGatewayUrl, {
            prompt: formatPrompt(prompt, gameTree),
            max_tokens: getMaxTokens(requestSize),
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${aiGatewayKey}`,
                'Content-Type': 'application/json'
            }
        });

        // Process the response into a format the plugin can use
        return processAIResponse(response.data, gameTree);
    } catch (error) {
        logger.error('Error calling AI gateway:', error);
        throw new Error('Failed to generate code');
    }
};

const formatPrompt = (prompt, gameTree) => {
    return `Generate Roblox Lua code for the following request:
    
${prompt}

Game Context:
${JSON.stringify(gameTree, null, 2)}

Please provide the code in the following format:
{
    "scripts": [
        {
            "type": "Script|LocalScript|ModuleScript",
            "name": "ScriptName",
            "path": ["Service", "Folder", "etc"],
            "source": "-- Lua code here"
        }
    ]
}`;
};

const getMaxTokens = (requestSize) => {
    const tokenLimits = {
        small: 1000,
        medium: 2000,
        large: 4000
    };
    return tokenLimits[requestSize] || 2000;
};

const processAIResponse = (aiResponse, gameTree) => {
    // Process the AI response into a format the plugin can use
    try {
        const response = typeof aiResponse === 'string' 
            ? JSON.parse(aiResponse) 
            : aiResponse;

        // Validate the response structure
        if (!response.scripts || !Array.isArray(response.scripts)) {
            throw new Error('Invalid AI response format');
        }

        return response;
    } catch (error) {
        logger.error('Error processing AI response:', error);
        throw new Error('Failed to process AI response');
    }
};

module.exports = {
    generateLuaCode
};