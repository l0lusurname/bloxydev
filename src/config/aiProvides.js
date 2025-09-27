// config/aiProviders.js
const AI_PROVIDERS = {
    OPENROUTER: {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        keyEnvVar: 'OPENROUTER_API_KEY',
        defaultModel: 'deepseek/deepseek-r1-0528:free',
        models: [
            'deepseek/deepseek-r1-0528:free',
            'anthropic/claude-3.5-sonnet',
            'openai/gpt-4-turbo',
            'google/gemini-pro'
        ],
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': process.env.SITE_URL || 'https://your-app.com',
            'X-Title': process.env.SITE_NAME || 'Roblox AI Assistant',
            'Content-Type': 'application/json'
        }),
        formatRequest: (messages, model, maxTokens) => ({
            model,
            messages,
            temperature: 0.3,
            max_tokens: maxTokens
        }),
        extractResponse: (response) => response.data.choices[0].message.content
    },

    OPENAI: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        keyEnvVar: 'OPENAI_API_KEY',
        defaultModel: 'gpt-4-turbo-preview',
        models: [
            'gpt-4-turbo-preview',
            'gpt-4',
            'gpt-3.5-turbo'
        ],
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }),
        formatRequest: (messages, model, maxTokens) => ({
            model,
            messages,
            temperature: 0.3,
            max_tokens: maxTokens
        }),
        extractResponse: (response) => response.data.choices[0].message.content
    },

    ANTHROPIC: {
        name: 'Anthropic Claude',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        keyEnvVar: 'ANTHROPIC_API_KEY',
        defaultModel: 'claude-3-sonnet-20240229',
        models: [
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
        ],
        headers: (apiKey) => ({
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        }),
        formatRequest: (messages, model, maxTokens) => {
            // Claude uses a different message format
            const systemMessage = messages.find(m => m.role === 'system');
            const userMessages = messages.filter(m => m.role !== 'system');
            
            return {
                model,
                max_tokens: maxTokens,
                system: systemMessage?.content || '',
                messages: userMessages
            };
        },
        extractResponse: (response) => response.data.content[0].text
    },

    GOOGLE: {
        name: 'Google Gemini',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        keyEnvVar: 'GOOGLE_API_KEY',
        defaultModel: 'gemini-pro',
        models: [
            'gemini-pro',
            'gemini-pro-vision'
        ],
        headers: (apiKey) => ({
            'Content-Type': 'application/json'
        }),
        formatRequest: (messages, model, maxTokens, apiKey) => {
            // Gemini uses a different format
            const contents = messages.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            return {
                url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
                data: {
                    contents,
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: maxTokens
                    }
                }
            };
        },
        extractResponse: (response) => response.data.candidates[0].content.parts[0].text
    }
};

// Auto-detect provider based on available API keys
const detectAvailableProvider = () => {
    for (const [providerKey, provider] of Object.entries(AI_PROVIDERS)) {
        if (process.env[provider.keyEnvVar]) {
            console.log(`Detected ${provider.name} API key, using as primary provider`);
            return { key: providerKey, provider };
        }
    }
    
    throw new Error('No AI provider API key found. Please set one of: ' + 
        Object.values(AI_PROVIDERS).map(p => p.keyEnvVar).join(', '));
};

// Get provider by name or auto-detect
const getProvider = (providerName = null) => {
    if (providerName) {
        const provider = AI_PROVIDERS[providerName.toUpperCase()];
        if (!provider) {
            throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(AI_PROVIDERS).join(', ')}`);
        }
        
        if (!process.env[provider.keyEnvVar]) {
            throw new Error(`API key not found for ${provider.name}. Please set ${provider.keyEnvVar}`);
        }
        
        return { key: providerName.toUpperCase(), provider };
    }
    
    return detectAvailableProvider();
};

// Get all available providers (with API keys)
const getAvailableProviders = () => {
    return Object.entries(AI_PROVIDERS)
        .filter(([_, provider]) => process.env[provider.keyEnvVar])
        .map(([key, provider]) => ({
            key,
            name: provider.name,
            models: provider.models,
            defaultModel: provider.defaultModel
        }));
};

module.exports = {
    AI_PROVIDERS,
    detectAvailableProvider,
    getProvider,
    getAvailableProviders
};