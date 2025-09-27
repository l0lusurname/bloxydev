const axios = require('axios');
const logger = require('../utils/logger');

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const generateLuaCode = async (prompt, gameTree, requestSize, mode = 'direct_edit', selectedInstances = []) => {
    try {
        const systemPrompt = getSystemPrompt(mode);
        const userPrompt = formatEnhancedPrompt(prompt, gameTree, selectedInstances, mode);

        logger.info(`Generating code in ${mode} mode for prompt: ${prompt.substring(0, 100)}...`);

        const response = await axios.post(OPENROUTER_API_URL, {
            model: "deepseek/deepseek-r1-0528:free", // Free DeepSeek model via OpenRouter
            messages: [{
                role: "system",
                content: systemPrompt
            }, {
                role: "user",
                content: userPrompt
            }],
            temperature: 0.3,
            max_tokens: getMaxTokens(requestSize)
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': process.env.SITE_URL || 'https://your-app.com',
                'X-Title': process.env.SITE_NAME || 'Roblox AI Assistant',
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
        });

        const aiResponse = response.data.choices[0].message.content;
        logger.info('AI response received, processing...');

        return processEnhancedResponse(aiResponse, gameTree, mode);
    } catch (error) {
        logger.error('Error calling OpenRouter:', error.message);
        if (error.response) {
            logger.error('Response status:', error.response.status);
            logger.error('Response data:', error.response.data);
        }
        throw new Error('Failed to generate code: ' + error.message);
    }
};

const getSystemPrompt = (mode) => {
    const basePrompt = `You are an expert Roblox Studio AI assistant that can directly manipulate game instances and scripts. You understand the full Roblox API and can perform precise operations.

CRITICAL: You must respond with valid JSON only. No additional text or explanations outside the JSON structure.`;

    if (mode === 'direct_edit') {
        return basePrompt + `

Your job is to perform DIRECT EDITS to existing instances and scripts without creating new scripts unless absolutely necessary. You can:
1. Modify properties of existing instances (Vector3, UDim2, Color3, CFrame, numbers, booleans, strings)
2. Edit specific lines of existing scripts (replace, insert, delete lines)
3. Delete instances when requested
4. Create new instances only if specifically requested

Response format:
{
    "operations": [
        {
            "type": "modify_instance",
            "path": ["Workspace", "Part1"],
            "properties": {
                "Size": {"type": "Vector3", "value": "10,1,10"},
                "Color": {"type": "Color3", "value": "1,0,0"},
                "Material": "Neon",
                "Anchored": true
            }
        },
        {
            "type": "edit_script",
            "path": ["ServerScriptService", "MyScript"],
            "modifications": [
                {
                    "action": "replace",
                    "lineNumber": 5,
                    "newContent": "    print('Modified line')"
                },
                {
                    "action": "insert",
                    "lineNumber": 10,
                    "content": "    -- New functionality added"
                },
                {
                    "action": "delete",
                    "lineNumber": 15
                }
            ]
        },
        {
            "type": "delete_instance",
            "path": ["Workspace", "ObsoleteModel"]
        }
    ],
    "summary": "Brief description of changes made"
}

Be extremely precise with paths and property types. Use minimal operations to achieve the goal.`;
    } else {
        return basePrompt + `

Your job is to generate new scripts and instances when direct editing isn't suitable.

Response format:
{
    "scripts": [
        {
            "type": "Script|LocalScript|ModuleScript",
            "name": "ScriptName",
            "path": ["Service", "Folder"],
            "source": "-- Complete Lua code here"
        }
    ],
    "instances": [
        {
            "className": "Part|Model|etc",
            "name": "InstanceName", 
            "path": ["Parent1", "Parent2"],
            "properties": {
                "Size": {"type": "Vector3", "value": "1,2,3"},
                "Position": {"type": "Vector3", "value": "0,5,0"}
            }
        }
    ]
}`;
    }
};

const formatEnhancedPrompt = (prompt, gameTree, selectedInstances, mode) => {
    let formattedPrompt = `User Request: ${prompt}\n\nMode: ${mode}\n`;

    // Add selected instances context
    if (selectedInstances && selectedInstances.length > 0) {
        formattedPrompt += `\nCurrently Selected Instances:\n`;
        selectedInstances.forEach(instance => {
            formattedPrompt += `- ${instance.className} "${instance.name}" at ${instance.path.join('/')}\n`;
        });
    }

    // Add relevant game tree context (optimized)
    formattedPrompt += `\nGame Structure Context:\n`;
    formattedPrompt += formatGameTreeContext(gameTree, prompt);

    // Add operation-specific instructions
    if (mode === 'direct_edit') {
        formattedPrompt += `\nIMPORTANT: Perform direct modifications to existing instances. Do not create scripts unless absolutely necessary.
        
Examples of what you should do:
- "make all parts red" → modify Color property of existing parts
- "delete spawn locations" → delete SpawnLocation instances
- "resize selected part" → modify Size property of selected instance
- "anchor all parts" → modify Anchored property of parts
- "fix script error on line 25" → edit specific line in script

Focus on minimal, precise changes that directly address the request.`;
    }

    return formattedPrompt;
};

const formatGameTreeContext = (gameTree, prompt) => {
    // Analyze prompt to determine what context is needed
    const needsWorkspace = prompt.toLowerCase().includes('part') || 
                          prompt.toLowerCase().includes('model') ||
                          prompt.toLowerCase().includes('spawn');
    
    const needsScripts = prompt.toLowerCase().includes('script') ||
                        prompt.toLowerCase().includes('code') ||
                        prompt.toLowerCase().includes('function');

    let context = '';

    if (needsWorkspace && gameTree.Workspace) {
        context += 'Workspace Contents:\n';
        context += formatInstanceTree(gameTree.Workspace, 2);
    }

    if (needsScripts) {
        ['ReplicatedStorage', 'ServerStorage', 'StarterGui'].forEach(service => {
            if (gameTree[service]) {
                const scripts = findScriptsInTree(gameTree[service]);
                if (scripts.length > 0) {
                    context += `\n${service} Scripts:\n`;
                    scripts.forEach(script => {
                        context += `- ${script.name} (${script.type})\n`;
                        if (script.source) {
                            context += `  Source preview: ${script.source.substring(0, 200)}...\n`;
                        }
                    });
                }
            }
        });
    }

    return context;
};

const formatInstanceTree = (instance, maxDepth, currentDepth = 0) => {
    if (currentDepth >= maxDepth) return '';

    let result = `${'  '.repeat(currentDepth)}- ${instance.Name} (${instance.ClassName})`;
    
    if (instance.Properties) {
        const keyProps = [];
        if (instance.Properties.Position) keyProps.push(`Pos:${instance.Properties.Position}`);
        if (instance.Properties.Size) keyProps.push(`Size:${instance.Properties.Size}`);
        if (instance.Properties.Anchored !== undefined) keyProps.push(`Anchored:${instance.Properties.Anchored}`);
        if (keyProps.length > 0) {
            result += ` [${keyProps.join(', ')}]`;
        }
    }
    
    result += '\n';

    if (instance.Children && instance.Children.length > 0) {
        instance.Children.forEach(child => {
            result += formatInstanceTree(child, maxDepth, currentDepth + 1);
        });
    }

    return result;
};

const findScriptsInTree = (instance) => {
    const scripts = [];
    
    if (instance.ClassName && (instance.ClassName.includes('Script') || instance.ClassName === 'ModuleScript')) {
        scripts.push({
            name: instance.Name,
            type: instance.ClassName,
            source: instance.Properties ? instance.Properties.Source : null
        });
    }

    if (instance.Children) {
        instance.Children.forEach(child => {
            scripts.push(...findScriptsInTree(child));
        });
    }

    return scripts;
};

const processEnhancedResponse = (aiResponse, gameTree, mode) => {
    try {
        const response = typeof aiResponse === 'string' 
            ? JSON.parse(aiResponse) 
            : aiResponse;

        logger.info(`Processing AI response in ${mode} mode`);

        if (mode === 'direct_edit') {
            return {
                modifications: extractModifications(response.operations),
                scriptEdits: extractScriptEdits(response.operations),
                deletions: extractDeletions(response.operations),
                instances: extractNewInstances(response.operations),
                summary: response.summary || 'AI operations completed'
            };
        } else {
            // Traditional script generation mode
            return {
                scripts: response.scripts || [],
                instances: response.instances || [],
                summary: response.summary || 'Scripts generated'
            };
        }
    } catch (error) {
        logger.error('Error processing AI response:', error);
        logger.error('Raw response:', aiResponse);
        throw new Error('Failed to process AI response: ' + error.message);
    }
};

const extractModifications = (operations) => {
    return operations
        .filter(op => op.type === 'modify_instance')
        .map(op => ({
            path: op.path,
            properties: op.properties
        }));
};

const extractScriptEdits = (operations) => {
    return operations
        .filter(op => op.type === 'edit_script')
        .map(op => ({
            path: op.path,
            modifications: op.modifications
        }));
};

const extractDeletions = (operations) => {
    return operations
        .filter(op => op.type === 'delete_instance')
        .map(op => ({
            path: op.path
        }));
};

const extractNewInstances = (operations) => {
    return operations
        .filter(op => op.type === 'create_instance')
        .map(op => ({
            className: op.className,
            name: op.name,
            path: op.path,
            properties: op.properties || {}
        }));
};

const getMaxTokens = (requestSize) => {
    const tokenLimits = {
        small: 1500,
        medium: 3000,
        large: 6000
    };
    return tokenLimits[requestSize] || 3000;
};

// Function to validate and sanitize operations
const validateOperations = (operations) => {
    const validatedOps = [];

    for (const op of operations) {
        try {
            if (op.type === 'modify_instance' && op.path && op.properties) {
                // Validate property types and values
                const validatedProps = {};
                for (const [propName, propValue] of Object.entries(op.properties)) {
                    if (typeof propValue === 'object' && propValue.type && propValue.value) {
                        // Validate property value format
                        if (validatePropertyValue(propValue.type, propValue.value)) {
                            validatedProps[propName] = propValue;
                        } else {
                            logger.warn(`Invalid property value for ${propName}: ${propValue.value}`);
                        }
                    } else {
                        validatedProps[propName] = propValue;
                    }
                }
                
                if (Object.keys(validatedProps).length > 0) {
                    validatedOps.push({
                        ...op,
                        properties: validatedProps
                    });
                }
            } else {
                validatedOps.push(op);
            }
        } catch (error) {
            logger.warn(`Skipping invalid operation: ${error.message}`);
        }
    }

    return validatedOps;
};

const validatePropertyValue = (type, value) => {
    try {
        switch (type) {
            case 'Vector3':
                const v3Parts = value.split(',');
                return v3Parts.length === 3 && v3Parts.every(p => !isNaN(parseFloat(p.trim())));
            
            case 'UDim2':
                const udimParts = value.split(',');
                return udimParts.length === 4 && udimParts.every(p => !isNaN(parseFloat(p.trim())));
            
            case 'Color3':
                const colorParts = value.split(',');
                return colorParts.length === 3 && 
                       colorParts.every(p => {
                           const num = parseFloat(p.trim());
                           return !isNaN(num) && num >= 0 && num <= 1;
                       });
            
            case 'CFrame':
                const cfParts = value.split(',');
                return cfParts.length >= 3 && cfParts.every(p => !isNaN(parseFloat(p.trim())));
            
            case 'number':
                return !isNaN(parseFloat(value));
            
            case 'boolean':
                return value === 'true' || value === 'false' || typeof value === 'boolean';
            
            default:
                return true; // Allow string values
        }
    } catch (error) {
        return false;
    }
};

module.exports = {
    generateLuaCode,
    validateOperations
};