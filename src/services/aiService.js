const axios = require('axios');
const logger = require('../utils/logger');

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";

const generateLuaCode = async (prompt, gameTree, requestSize) => {
    try {
        const response = await axios.post(DEEPSEEK_API_URL, {
            model: "deepseek-coder-33b-instruct",
            messages: [{
                role: "system",
                content: `You are an expert Roblox Lua programmer. Generate code based on the user's request and game context.
                Your responses should be in valid JSON format with the following structure:
                {
                    "scripts": [{
                        "type": "Script|LocalScript|ModuleScript",
                        "name": "ScriptName",
                        "path": ["Service", "Folder", "etc"],
                        "source": "-- Lua code here"
                    }],
                    "instances": [{
                        "className": "Part|Model|Folder|etc",
                        "name": "InstanceName",
                        "path": ["Parent1", "Parent2"],
                        "properties": {
                            "Size": [1, 2, 3],
                            "Position": [0, 5, 0],
                            "Color": [1, 1, 1],
                            ... other properties
                        }
                    }],
                    "modifications": [{
                        "path": ["Workspace", "ExistingModel", "Part"],
                        "properties": {
                            "Anchored": true,
                            ... properties to change
                        }
                    }]
                }`
            }, {
                role: "user",
                content: formatPrompt(prompt, gameTree)
            }],
            temperature: 0.7,
            max_tokens: getMaxTokens(requestSize),
            response_format: { type: "json_object" }
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Process the response into a format the plugin can use
        return processAIResponse(response.data.choices[0].message.content, gameTree);
    } catch (error) {
        logger.error('Error calling Deepseek:', error);
        throw new Error('Failed to generate code: ' + error.message);
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