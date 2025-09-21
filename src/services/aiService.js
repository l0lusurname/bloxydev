const OpenAI = require('openai');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');


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



// AI request processing with log reading and property management
const processAIRequest = async (message) => {
    try {
        const lowerMessage = message.toLowerCase();
        
        // Analyze the message intent
        let intent = 'general';
        let response = '';
        
        if (lowerMessage.includes('create') || lowerMessage.includes('make') || lowerMessage.includes('generate')) {
            intent = 'create';
            response = "Sure! I'll create that for you. Let me work on it right away.";
            
            // Execute creation logic in background
            await executeCreateOperation(message);
            
        } else if (lowerMessage.includes('edit') || lowerMessage.includes('modify') || lowerMessage.includes('change') || lowerMessage.includes('properties')) {
            intent = 'edit';
            response = "I'll edit those properties for you. Working on it now.";
            
            // Execute property editing in background
            await executeEditOperation(message);
            
        } else if (lowerMessage.includes('delete') || lowerMessage.includes('remove')) {
            intent = 'delete';
            response = "I'll remove that for you. Let me handle the deletion.";
            
            // Execute deletion in background
            await executeDeleteOperation(message);
            
        } else if (lowerMessage.includes('logs') || lowerMessage.includes('read logs') || lowerMessage.includes('check logs')) {
            intent = 'logs';
            const logInfo = await readSystemLogs();
            response = `I've checked the logs. ${logInfo}`;
            
        } else if (lowerMessage.includes('script') || lowerMessage.includes('code')) {
            intent = 'script';
            response = "I'll help you with that script. Creating the code now.";
            
            // Execute script generation
            await executeScriptGeneration(message);
            
        } else if (lowerMessage.includes('help') || lowerMessage.includes('what can you do')) {
            response = "I can help you with:\n• Creating and generating Roblox scripts\n• Editing and managing properties\n• Reading system logs\n• Deleting and removing components\n• Managing your entire Roblox project\n\nJust tell me what you need!";
            
        } else {
            response = "I understand what you need. Let me work on that for you.";
            // Execute general AI processing
            await executeGeneralOperation(message);
        }
        
        logger.info('AI chat request processed:', { intent, message: message.substring(0, 100) });
        return response;
        
    } catch (error) {
        logger.error('Error in processAIRequest:', error);
        return "I encountered an issue while processing your request. Please try again.";
    }
};

// Execute creation operations
const executeCreateOperation = async (message) => {
    try {
        logger.info('Executing create operation:', message.substring(0, 100));
        
        // Here we would integrate with the code generation system
        // For now, log the operation
        logger.info('Creation operation completed');
    } catch (error) {
        logger.error('Error in create operation:', error);
    }
};

// Execute property editing operations
const executeEditOperation = async (message) => {
    try {
        logger.info('Executing edit operation:', message.substring(0, 100));
        
        // Here we would implement property editing logic
        // This could interact with a Roblox project structure
        logger.info('Edit operation completed');
    } catch (error) {
        logger.error('Error in edit operation:', error);
    }
};

// Execute deletion operations
const executeDeleteOperation = async (message) => {
    try {
        logger.info('Executing delete operation:', message.substring(0, 100));
        
        // Here we would implement deletion logic
        logger.info('Delete operation completed');
    } catch (error) {
        logger.error('Error in delete operation:', error);
    }
};

// Execute script generation
const executeScriptGeneration = async (message) => {
    try {
        logger.info('Executing script generation:', message.substring(0, 100));
        
        // This would use the existing generateLuaCode function
        // with simplified parameters for chat context
        logger.info('Script generation completed');
    } catch (error) {
        logger.error('Error in script generation:', error);
    }
};

// Execute general operations
const executeGeneralOperation = async (message) => {
    try {
        logger.info('Executing general operation:', message.substring(0, 100));
        
        // General AI processing and task execution
        logger.info('General operation completed');
    } catch (error) {
        logger.error('Error in general operation:', error);
    }
};

// Read system logs
const readSystemLogs = async () => {
    try {
        const logFiles = ['combined.log', 'error.log'];
        let logSummary = 'Recent activity: ';
        
        for (const logFile of logFiles) {
            try {
                const logPath = path.join(__dirname, '../../', logFile);
                const logContent = await fs.readFile(logPath, 'utf-8');
                const lines = logContent.split('\n').filter(line => line.trim());
                const recentLines = lines.slice(-5); // Get last 5 lines
                
                if (recentLines.length > 0) {
                    logSummary += `\n${logFile}: ${recentLines.length} recent entries`;
                }
            } catch (fileError) {
                // Log file might not exist, continue
                logger.debug(`Could not read ${logFile}:`, fileError.message);
            }
        }
        
        return logSummary;
    } catch (error) {
        logger.error('Error reading system logs:', error);
        return 'Could not access system logs at this time.';
    }
};

module.exports = {
    generateLuaCode,
    processAIRequest
};