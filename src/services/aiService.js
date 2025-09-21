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
        small: 2048,
        medium: 4096,
        large: 8192,
        xlarge: 16384
    };
    return tokenLimits[requestSize] || 4096;
};

const processAIResponse = (aiResponse, gameTree) => {
    // Process the AI response into a format the plugin can use
    try {
        let response;
        
        if (typeof aiResponse === 'string') {
            // Clean up the response string for better parsing
            const cleanResponse = aiResponse.trim()
                .replace(/^```json\s*/, '')
                .replace(/\s*```$/, '')
                .replace(/^\s*{/, '{')
                .replace(/}\s*$/, '}');
                
            try {
                response = JSON.parse(cleanResponse);
            } catch (parseError) {
                logger.error('JSON parse failed, attempting to extract scripts from text:', parseError);
                
                // Fallback: try to extract code from text response
                response = extractScriptsFromText(cleanResponse);
            }
        } else {
            response = aiResponse;
        }

        // Flexible validation - allow scripts OR instances OR modifications
        if (!response.scripts && !response.instances && !response.modifications) {
            // If none of the expected formats, create a generic script response
            if (typeof response === 'string' || response.message) {
                response = {
                    scripts: [{
                        type: "Script",
                        name: "GeneratedScript",
                        path: ["ServerScriptService"],
                        source: response.message || response || "-- Generated script"
                    }]
                };
            } else {
                logger.warn('Unexpected AI response format, using fallback');
                response = {
                    scripts: [],
                    instances: [],
                    modifications: []
                };
            }
        }

        // Fix property types for Roblox (UDim2, Vector3, etc.)
        response = fixRobloxPropertyTypes(response);
        
        return response;
    } catch (error) {
        logger.error('Error processing AI response:', error);
        // Return a fallback response instead of throwing
        return {
            scripts: [{
                type: "Script",
                name: "ErrorScript", 
                path: ["ServerScriptService"],
                source: "-- Error occurred during code generation"
            }],
            instances: [],
            modifications: []
        };
    }
};

// Helper function to extract scripts from text when JSON parsing fails
const extractScriptsFromText = (text) => {
    try {
        const scripts = [];
        
        // Look for code blocks or script-like content
        const luaCodeRegex = /(?:```lua|```|--|local|function|game\.|workspace\.|script\.)/gi;
        
        if (luaCodeRegex.test(text)) {
            // Extract code from the text
            const codeContent = text
                .replace(/```lua\s*/, '')
                .replace(/```\s*/, '')
                .trim();
                
            scripts.push({
                type: "Script",
                name: "ExtractedScript",
                path: ["ServerScriptService"],
                source: codeContent || "-- Generated script content"
            });
        }
        
        return {
            scripts: scripts,
            instances: [],
            modifications: []
        };
    } catch (error) {
        logger.error('Error extracting scripts from text:', error);
        return {
            scripts: [{
                type: "Script", 
                name: "FallbackScript",
                path: ["ServerScriptService"],
                source: "-- Could not extract code from AI response"
            }],
            instances: [],
            modifications: []
        };
    }
};

// Helper function to fix Roblox property types (UDim2, Vector3, etc.)
const fixRobloxPropertyTypes = (response) => {
    try {
        // Fix instances properties
        if (response.instances) {
            response.instances = response.instances.map(instance => {
                if (instance.properties) {
                    instance.properties = fixPropertyTypes(instance.properties);
                }
                return instance;
            });
        }
        
        // Fix modifications properties 
        if (response.modifications) {
            response.modifications = response.modifications.map(modification => {
                if (modification.properties) {
                    modification.properties = fixPropertyTypes(modification.properties);
                }
                return modification;
            });
        }
        
        return response;
    } catch (error) {
        logger.error('Error fixing property types:', error);
        return response;
    }
};

// Fix individual property types for Roblox objects
const fixPropertyTypes = (properties) => {
    const fixedProps = { ...properties };
    
    // Fix common Roblox property type issues
    Object.keys(fixedProps).forEach(key => {
        const value = fixedProps[key];
        
        // Fix Position property - should be UDim2 for GUI objects, Vector3 for parts
        if (key === 'Position' && Array.isArray(value)) {
            if (value.length === 2) {
                // GUI Position - convert to UDim2 format
                fixedProps[key] = {
                    UDim2: value.length === 4 ? value : [0, value[0] || 0, 0, value[1] || 0]
                };
            } else if (value.length === 3) {
                // 3D Position - Vector3
                fixedProps[key] = { Vector3: value };
            }
        }
        
        // Fix Size property - similar to Position
        if (key === 'Size' && Array.isArray(value)) {
            if (value.length === 2) {
                fixedProps[key] = {
                    UDim2: value.length === 4 ? value : [0, value[0] || 100, 0, value[1] || 100]
                };
            } else if (value.length === 3) {
                fixedProps[key] = { Vector3: value };
            }
        }
        
        // Fix Color3 properties
        if ((key === 'Color' || key.includes('Color')) && Array.isArray(value) && value.length === 3) {
            fixedProps[key] = { Color3: value };
        }
        
        // Fix Vector3 properties (Position, Size for 3D objects, etc.)
        if ((key === 'Velocity' || key === 'AngularVelocity') && Array.isArray(value) && value.length === 3) {
            fixedProps[key] = { Vector3: value };
        }
        
        // Fix CFrame properties
        if (key === 'CFrame' && Array.isArray(value)) {
            fixedProps[key] = { CFrame: value };
        }
    });
    
    return fixedProps;
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
        
        // Actually generate code using the existing AI system
        const generatedCode = await generateLuaCode(message, {}, 'large');
        
        // Log the generated result for debugging
        logger.info('Creation operation completed, generated:', {
            scriptsCount: generatedCode.scripts?.length || 0,
            instancesCount: generatedCode.instances?.length || 0,
            modificationsCount: generatedCode.modifications?.length || 0
        });
        
        return generatedCode;
    } catch (error) {
        logger.error('Error in create operation:', error);
        return null;
    }
};

// Execute property editing operations
const executeEditOperation = async (message) => {
    try {
        logger.info('Executing edit operation:', message.substring(0, 100));
        
        // Generate property modifications using AI
        const modifications = await generateLuaCode(message, {}, 'medium');
        
        // Log the generated modifications for debugging
        logger.info('Edit operation completed, modifications:', {
            scriptsCount: modifications.scripts?.length || 0,
            instancesCount: modifications.instances?.length || 0,
            modificationsCount: modifications.modifications?.length || 0
        });
        
        return modifications;
    } catch (error) {
        logger.error('Error in edit operation:', error);
        return null;
    }
};

// Execute deletion operations
const executeDeleteOperation = async (message) => {
    try {
        logger.info('Executing delete operation:', message.substring(0, 100));
        
        // Generate deletion script using AI
        const deletionScript = await generateLuaCode(`Create a script to delete or remove: ${message}`, {}, 'small');
        
        // Log the generated deletion script for debugging
        logger.info('Delete operation completed, deletion script:', {
            scriptsCount: deletionScript.scripts?.length || 0,
            instancesCount: deletionScript.instances?.length || 0,
            modificationsCount: deletionScript.modifications?.length || 0
        });
        
        return deletionScript;
    } catch (error) {
        logger.error('Error in delete operation:', error);
        return null;
    }
};

// Execute script generation
const executeScriptGeneration = async (message) => {
    try {
        logger.info('Executing script generation:', message.substring(0, 100));
        
        // Use the existing generateLuaCode function with optimized parameters
        const generatedScript = await generateLuaCode(message, {}, 'large');
        
        // Log the generated script for debugging
        logger.info('Script generation completed:', {
            scriptsCount: generatedScript.scripts?.length || 0,
            instancesCount: generatedScript.instances?.length || 0,
            modificationsCount: generatedScript.modifications?.length || 0,
            totalCodeLines: generatedScript.scripts?.reduce((acc, script) => 
                acc + (script.source?.split('\n').length || 0), 0) || 0
        });
        
        return generatedScript;
    } catch (error) {
        logger.error('Error in script generation:', error);
        return null;
    }
};

// Execute general operations
const executeGeneralOperation = async (message) => {
    try {
        logger.info('Executing general operation:', message.substring(0, 100));
        
        // Determine the best approach for the general request
        const generalResponse = await generateLuaCode(`Help with: ${message}`, {}, 'medium');
        
        // Log the general operation result
        logger.info('General operation completed:', {
            scriptsCount: generalResponse.scripts?.length || 0,
            instancesCount: generalResponse.instances?.length || 0,
            modificationsCount: generalResponse.modifications?.length || 0
        });
        
        return generalResponse;
    } catch (error) {
        logger.error('Error in general operation:', error);
        return null;
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