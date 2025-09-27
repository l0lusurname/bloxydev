// services/aiService.js
const axios = require('axios');
const logger = require('../utils/logger');
const { getProvider, getAvailableProviders } = require('../config/aiProviders');

class MultiAIService {
    constructor() {
        this.currentProvider = null;
        this.fallbackProviders = [];
        this.initializeProviders();
    }

    initializeProviders() {
        try {
            // Try to detect primary provider
            this.currentProvider = getProvider();
            logger.info(`Initialized with primary provider: ${this.currentProvider.provider.name}`);

            // Get fallback providers
            this.fallbackProviders = getAvailableProviders()
                .filter(p => p.key !== this.currentProvider.key);
            
            if (this.fallbackProviders.length > 0) {
                logger.info(`Available fallback providers: ${this.fallbackProviders.map(p => p.name).join(', ')}`);
            }
        } catch (error) {
            logger.error('Failed to initialize AI providers:', error.message);
            throw error;
        }
    }

    // Switch to a specific provider
    switchProvider(providerName) {
        try {
            this.currentProvider = getProvider(providerName);
            logger.info(`Switched to provider: ${this.currentProvider.provider.name}`);
            return true;
        } catch (error) {
            logger.error(`Failed to switch to provider ${providerName}:`, error.message);
            return false;
        }
    }

    // Get current provider info
    getCurrentProvider() {
        return {
            name: this.currentProvider.provider.name,
            model: this.currentProvider.provider.defaultModel,
            available: this.fallbackProviders.map(p => ({ name: p.name, models: p.models }))
        };
    }

    // Main generation method with automatic fallback
    async generateLuaCode(prompt, gameTree, requestSize, mode = 'direct_edit', selectedInstances = []) {
        const providers = [this.currentProvider, ...this.fallbackProviders.map(p => getProvider(p.key))];
        
        for (let i = 0; i < providers.length; i++) {
            const providerInfo = providers[i];
            
            try {
                logger.info(`Attempting generation with ${providerInfo.provider.name} (attempt ${i + 1}/${providers.length})`);
                
                const result = await this.generateWithProvider(
                    providerInfo, 
                    prompt, 
                    gameTree, 
                    requestSize, 
                    mode, 
                    selectedInstances
                );
                
                // If successful and not using primary provider, log the fallback
                if (i > 0) {
                    logger.warn(`Primary provider failed, successfully used fallback: ${providerInfo.provider.name}`);
                }
                
                return result;
                
            } catch (error) {
                logger.error(`${providerInfo.provider.name} failed:`, error.message);
                
                // If this is the last provider, throw the error
                if (i === providers.length - 1) {
                    throw new Error(`All AI providers failed. Last error: ${error.message}`);
                }
                
                // Continue to next provider
                logger.info(`Trying fallback provider...`);
            }
        }
    }

    // Generate with specific provider
    async generateWithProvider(providerInfo, prompt, gameTree, requestSize, mode, selectedInstances) {
        const { provider } = providerInfo;
        const apiKey = process.env[provider.keyEnvVar];
        
        if (!apiKey) {
            throw new Error(`API key not found for ${provider.name}`);
        }

        const systemPrompt = this.getSystemPrompt(mode);
        const userPrompt = this.formatEnhancedPrompt(prompt, gameTree, selectedInstances, mode);
        const maxTokens = this.getMaxTokens(requestSize);

        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];

        logger.info(`Generating code with ${provider.name} using model: ${provider.defaultModel}`);

        // Handle different provider formats
        let requestData, requestUrl;
        
        if (provider.name === 'Google Gemini') {
            const formatted = provider.formatRequest(messages, provider.defaultModel, maxTokens, apiKey);
            requestUrl = formatted.url;
            requestData = formatted.data;
        } else {
            requestUrl = provider.baseUrl;
            requestData = provider.formatRequest(messages, provider.defaultModel, maxTokens);
        }

        const response = await axios.post(requestUrl, requestData, {
            headers: provider.headers(apiKey),
            timeout: 60000 // 60 second timeout
        });

        const aiResponse = provider.extractResponse(response);
        logger.info(`${provider.name} response received, processing...`);

        return this.processEnhancedResponse(aiResponse, gameTree, mode);
    }

    getSystemPrompt(mode) {
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
    }

    formatEnhancedPrompt(prompt, gameTree, selectedInstances, mode) {
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
        formattedPrompt += this.formatGameTreeContext(gameTree, prompt);

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
    }

    formatGameTreeContext(gameTree, prompt) {
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
            context += this.formatInstanceTree(gameTree.Workspace, 2);
        }

        if (needsScripts) {
            ['ReplicatedStorage', 'ServerStorage', 'StarterGui'].forEach(service => {
                if (gameTree[service]) {
                    const scripts = this.findScriptsInTree(gameTree[service]);
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
    }

    formatInstanceTree(instance, maxDepth, currentDepth = 0) {
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
                result += this.formatInstanceTree(child, maxDepth, currentDepth + 1);
            });
        }

        return result;
    }

    findScriptsInTree(instance) {
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
                scripts.push(...this.findScriptsInTree(child));
            });
        }

        return scripts;
    }

    processEnhancedResponse(aiResponse, gameTree, mode) {
        try {
            const response = typeof aiResponse === 'string' 
                ? JSON.parse(aiResponse) 
                : aiResponse;

            logger.info(`Processing AI response in ${mode} mode`);

            if (mode === 'direct_edit') {
                return {
                    modifications: this.extractModifications(response.operations),
                    scriptEdits: this.extractScriptEdits(response.operations),
                    deletions: this.extractDeletions(response.operations),
                    instances: this.extractNewInstances(response.operations),
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
    }

    extractModifications(operations) {
        return operations
            .filter(op => op.type === 'modify_instance')
            .map(op => ({
                path: op.path,
                properties: op.properties
            }));
    }

    extractScriptEdits(operations) {
        return operations
            .filter(op => op.type === 'edit_script')
            .map(op => ({
                path: op.path,
                modifications: op.modifications
            }));
    }

    extractDeletions(operations) {
        return operations
            .filter(op => op.type === 'delete_instance')
            .map(op => ({
                path: op.path
            }));
    }

    extractNewInstances(operations) {
        return operations
            .filter(op => op.type === 'create_instance')
            .map(op => ({
                className: op.className,
                name: op.name,
                path: op.path,
                properties: op.properties || {}
            }));
    }

    getMaxTokens(requestSize) {
        const tokenLimits = {
            small: 1500,
            medium: 3000,
            large: 6000
        };
        return tokenLimits[requestSize] || 3000;
    }

    // Function to validate and sanitize operations
    validateOperations(operations) {
        const validatedOps = [];

        for (const op of operations) {
            try {
                if (op.type === 'modify_instance' && op.path && op.properties) {
                    // Validate property types and values
                    const validatedProps = {};
                    for (const [propName, propValue] of Object.entries(op.properties)) {
                        if (typeof propValue === 'object' && propValue.type && propValue.value) {
                            // Validate property value format
                            if (this.validatePropertyValue(propValue.type, propValue.value)) {
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
    }

    validatePropertyValue(type, value) {
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
    }

    // Test connection to current provider
    async testConnection() {
        try {
            const testPrompt = "Return JSON: {\"test\": \"success\"}";
            const testGameTree = { Workspace: { Name: "Workspace", ClassName: "Workspace", Children: [] } };
            
            await this.generateLuaCode(testPrompt, testGameTree, 'small', 'direct_edit', []);
            return { success: true, provider: this.currentProvider.provider.name };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

// Create singleton instance
const multiAIService = new MultiAIService();

// Export the instance and individual methods for backward compatibility
module.exports = {
    generateLuaCode: (prompt, gameTree, requestSize, mode, selectedInstances) => 
        multiAIService.generateLuaCode(prompt, gameTree, requestSize, mode, selectedInstances),
    
    validateOperations: (operations) => multiAIService.validateOperations(operations),
    
    // New exports for multi-provider functionality
    switchProvider: (providerName) => multiAIService.switchProvider(providerName),
    getCurrentProvider: () => multiAIService.getCurrentProvider(),
    getAvailableProviders,
    testConnection: () => multiAIService.testConnection()
};