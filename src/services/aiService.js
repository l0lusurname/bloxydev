const axios = require('axios');
const logger = require('../utils/logger');

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const generateLuaCode = async (prompt, gameTree, requestSize, mode = 'direct_edit', selectedInstances = []) => {
    try {
        const systemPrompt = getSystemPrompt(mode);
        const userPrompt = formatEnhancedPrompt(prompt, gameTree, selectedInstances, mode);

        logger.info(`Generating code in ${mode} mode for prompt: ${prompt.substring(0, 100)}...`);

        const response = await axios.post(OPENROUTER_API_URL, {
            model: "qwen/qwen-2.5-coder-32b-instruct:free", // Updated to use Qwen2.5 Coder 32B
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
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, // Keeping same API key name
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
    const basePrompt = `You are an expert Roblox Studio AI assistant. You understand the Roblox API and Lua scripting.

CRITICAL: You must respond with ONLY valid JSON. No markdown code blocks, no explanations, just pure JSON.`;

    if (mode === 'direct_edit') {
        return basePrompt + `

Perform direct edits to existing instances and scripts. Use this JSON format:

{
    "operations": [
        {
            "type": "modify_instance",
            "path": ["Workspace", "PartName"],
            "properties": {
                "BrickColor": "Really red",
                "Size": {"type": "Vector3", "value": "10,1,10"},
                "Anchored": true
            }
        },
        {
            "type": "delete_instance",
            "path": ["Workspace", "ItemToDelete"]
        }
    ],
    "summary": "Brief description"
}

For bulk operations like "delete all parts", create one delete_instance operation for each part you want to remove.`;
    } else {
        return basePrompt + `

Create new scripts and instances. Use this JSON format:

{
    "scripts": [
        {
            "type": "Script",
            "name": "HelloWorld",
            "path": ["ServerScriptService"],
            "source": "print('Hello World!')"
        }
    ],
    "instances": [
        {
            "className": "Part",
            "name": "MyPart",
            "path": ["Workspace"],
            "properties": {
                "Size": {"type": "Vector3", "value": "4,1,2"},
                "BrickColor": "Bright blue"
            }
        }
    ],
    "summary": "Brief description"
}

For scripts, use complete Lua code. For instances, include all necessary properties.`;
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

    // Add very limited game tree context to avoid token overflow
    formattedPrompt += `\nGame Structure Context (summary):\n`;
    
    // Only add essential context, heavily summarized
    if (gameTree.Workspace && gameTree.Workspace.Children) {
        const partCount = countInstancesByClass(gameTree.Workspace, 'Part');
        const modelCount = countInstancesByClass(gameTree.Workspace, 'Model');
        formattedPrompt += `Workspace contains: ${partCount} Parts, ${modelCount} Models\n`;
    }

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
    } else {
        formattedPrompt += `\nCreate new scripts and instances for this request. Place scripts in appropriate services like ServerScriptService or ReplicatedStorage.`;
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

    // Limit context to prevent token overflow - be very selective
    if (needsWorkspace && gameTree.Workspace) {
        context += 'Workspace Contents (summary):\n';
        context += formatInstanceTreeSummary(gameTree.Workspace);
    }

    if (needsScripts) {
        ['ReplicatedStorage', 'ServerStorage', 'StarterGui'].forEach(service => {
            if (gameTree[service]) {
                const scripts = findScriptsInTree(gameTree[service]);
                if (scripts.length > 0) {
                    context += `\n${service} Scripts:\n`;
                    scripts.slice(0, 3).forEach(script => { // Limit to 3 scripts per service
                        context += `- ${script.name} (${script.type})\n`;
                    });
                    if (scripts.length > 3) {
                        context += `... and ${scripts.length - 3} more scripts\n`;
                    }
                }
            }
        });
    }

    // Hard limit context to 1000 characters to prevent token overflow
    if (context.length > 1000) {
        context = context.substring(0, 997) + '...';
    }

    return context;
};

const formatInstanceTreeSummary = (instance, maxItems = 5, currentCount = 0) => {
    if (currentCount >= maxItems) return '';

    let result = `- ${instance.Name} (${instance.ClassName})\n`;
    let count = 1;

    if (instance.Children && instance.Children.length > 0) {
        // Only show first few children to avoid token overflow
        const childrenToShow = Math.min(3, instance.Children.length);
        for (let i = 0; i < childrenToShow && count < maxItems; i++) {
            const child = instance.Children[i];
            result += `  - ${child.Name} (${child.ClassName})\n`;
            count++;
        }
        if (instance.Children.length > childrenToShow) {
            result += `  ... and ${instance.Children.length - childrenToShow} more items\n`;
        }
    }

    return result;
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

const countInstancesByClass = (instance, className) => {
    let count = 0;
    
    if (instance.ClassName === className) {
        count++;
    }
    
    if (instance.Children && Array.isArray(instance.Children)) {
        instance.Children.forEach(child => {
            count += countInstancesByClass(child, className);
        });
    }
    
    return count;
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