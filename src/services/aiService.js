const axios = require('axios');
const logger = require('../utils/logger');

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const generateLuaCode = async (prompt, gameTree, requestSize, mode = 'direct_edit', selectedInstances = []) => {
    try {
        const systemPrompt = getSystemPrompt(mode);
        const userPrompt = formatEnhancedPrompt(prompt, gameTree, selectedInstances, mode);

        logger.info(`Generating code in ${mode} mode for prompt: ${prompt.substring(0, 100)}...`);

        const response = await axios.post(OPENROUTER_API_URL, {
            model: "qwen/qwen-2.5-coder-32b-instruct:free",
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
            timeout: 30000
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

You are in DIRECT EDIT mode. This means you should ONLY modify existing instances and scripts, NOT create new ones.

For SCRIPT MODIFICATION requests (like "modify the script", "edit the script", "add to the script"):
- Find the existing script by name in ServerScriptService
- Modify its Source property with the new/updated code
- DO NOT create any new parts or instances
- Include the COMPLETE updated script code

Use this JSON format for script modifications:

{
    "operations": [
        {
            "type": "modify_instance",
            "path": ["ServerScriptService", "ScriptName"],
            "properties": {
                "Source": "-- Complete updated script code here\\nlocal function newFunction()\\n    -- your code\\nend\\n\\n-- rest of the script"
            }
        }
    ],
    "summary": "Modified existing script"
}

For INSTANCE PROPERTY changes (like "make red", "resize", "move"):
{
    "operations": [
        {
            "type": "modify_instance", 
            "path": ["Workspace", "PartName"],
            "properties": {
                "BrickColor": "Really red",
                "Size": {"type": "Vector3", "value": "10,1,10"}
            }
        }
    ],
    "summary": "Modified instance properties"
}

For DELETIONS:
{
    "operations": [
        {
            "type": "delete_instance",
            "path": ["Workspace", "PartName"]
        }
    ],
    "summary": "Deleted instance"
}

IMPORTANT RULES FOR SCRIPT MODIFICATION:
1. If prompt mentions "modify/edit/change" + "script" = modify existing script Source
2. If prompt mentions "the script" = find and modify existing script
3. When modifying a script, provide the COMPLETE updated script code
4. DO NOT create new instances unless explicitly asked to CREATE something new
5. Script modifications should preserve existing functionality and add new features
6. Use proper Lua syntax and Roblox API calls

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
    "summary": "Created new scripts and instances"
}

For scripts, use complete Lua code. For instances, include all necessary properties.`;
    }
};

const formatEnhancedPrompt = (prompt, gameTree, selectedInstances, mode) => {
    let formattedPrompt = `User Request: ${prompt}\n\nMode: ${mode}\n`;

    // Add context about existing scripts when in direct_edit mode
    if (mode === 'direct_edit') {
        formattedPrompt += `\nEXISTING SCRIPTS IN SERVERSCRIPTSERVICE:\n`;
        
        // List existing scripts from game tree
        if (gameTree.ServerScriptService && gameTree.ServerScriptService.Children) {
            const scripts = findScriptsInChildren(gameTree.ServerScriptService.Children);
            if (scripts.length > 0) {
                scripts.forEach(script => {
                    formattedPrompt += `- ${script.name} (${script.type})\n`;
                });
            } else {
                formattedPrompt += `- No scripts found\n`;
            }
        } else {
            formattedPrompt += `- ServerScriptService not found in game tree\n`;
        }

        // Add existing parts context
        if (gameTree.Workspace && gameTree.Workspace.Children) {
            const parts = findPartsInChildren(gameTree.Workspace.Children);
            if (parts.length > 0) {
                formattedPrompt += `\nEXISTING PARTS IN WORKSPACE:\n`;
                parts.slice(0, 10).forEach(part => { // Limit to 10 for brevity
                    formattedPrompt += `- ${part.name} (${part.type})\n`;
                });
                if (parts.length > 10) {
                    formattedPrompt += `... and ${parts.length - 10} more parts\n`;
                }
            }
        }

        formattedPrompt += `\nIMPORTANT FOR SCRIPT MODIFICATION:
- If user says "modify the script" or "edit the script", find the existing script by name from the list above
- Replace the entire Source property with the updated code that includes both old and new functionality
- DO NOT create new parts or instances unless specifically requested
- The script modification should include the COMPLETE updated script code, not just additions
- If modifying game behavior (like making parts kill players), update the existing game script

Examples:
- "modify the FallingPartsGenerator script and make parts kill players" → Find existing FallingPartsGenerator script, update its Source to include kill functionality while keeping falling parts
- "edit the script to make parts bigger" → Find existing script, modify the part creation code to use larger sizes
- "change the script to spawn parts faster" → Update the existing script's timing/spawn rate
`;
    }

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
        formattedPrompt += `\nREMEMBER: You are in DIRECT EDIT mode. Focus on modifying existing scripts and instances, not creating new ones.`;
    } else {
        formattedPrompt += `\nCreate new scripts and instances for this request. Place scripts in appropriate services like ServerScriptService or ReplicatedStorage.`;
    }

    return formattedPrompt;
};

// Helper function to find scripts in game tree children
const findScriptsInChildren = (children) => {
    const scripts = [];
    
    if (!children || !Array.isArray(children)) return scripts;
    
    children.forEach(child => {
        if (child.ClassName === 'Script' || child.ClassName === 'LocalScript' || child.ClassName === 'ModuleScript') {
            scripts.push({
                name: child.Name,
                type: child.ClassName
            });
        }
        
        // Recursively check children
        if (child.Children && child.Children.length > 0) {
            scripts.push(...findScriptsInChildren(child.Children));
        }
    });
    
    return scripts;
};

// Helper function to find parts in game tree children
const findPartsInChildren = (children) => {
    const parts = [];
    
    if (!children || !Array.isArray(children)) return parts;
    
    children.forEach(child => {
        if (child.ClassName === 'Part' || child.ClassName === 'MeshPart' || child.ClassName === 'UnionOperation') {
            parts.push({
                name: child.Name,
                type: child.ClassName
            });
        }
        
        // Recursively check children (but limit depth)
        if (child.Children && child.Children.length > 0) {
            parts.push(...findPartsInChildren(child.Children));
        }
    });
    
    return parts;
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
                operations: response.operations || [], // Include raw operations for client processing
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
    if (!operations) return [];
    return operations
        .filter(op => op.type === 'modify_instance')
        .map(op => ({
            path: op.path,
            properties: op.properties
        }));
};

const extractScriptEdits = (operations) => {
    if (!operations) return [];
    return operations
        .filter(op => op.type === 'edit_script')
        .map(op => ({
            path: op.path,
            modifications: op.modifications,
            newSource: op.newSource
        }));
};

const extractDeletions = (operations) => {
    if (!operations) return [];
    return operations
        .filter(op => op.type === 'delete_instance')
        .map(op => ({
            path: op.path
        }));
};

const extractNewInstances = (operations) => {
    if (!operations) return [];
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