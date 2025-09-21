const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client with OpenRouter
const client = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENROUTER_API_KEY, // Support both key names
    defaultHeaders: {
        "HTTP-Referer": process.env.REPLIT_DOMAIN || "https://roblox-ai-assistant.replit.app",
        "X-Title": "Roblox AI Assistant"
    }
});

const generateLuaCode = async (prompt, gameTree, requestSize) => {
    try {
        const completion = await client.chat.completions.create({
            model: "qwen/qwen-2.5-coder-32b-instruct:free",
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
        });

        // Process the response into a format the plugin can use
        return processAIResponse(completion.choices[0].message.content, gameTree);
    } catch (error) {
        logger.error('Error calling OpenRouter:', {
            message: error.message,
            status: error.status,
            response: error.response?.data || error.response
        });
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
        small: 512,
        medium: 1024,
        large: 2048
    };
    return tokenLimits[requestSize] || 1024;
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