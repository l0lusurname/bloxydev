// routes/ai.js
const express = require('express');
const router = express.Router();
const { validateAIRequest, validateAnalyzeRequest } = require('../middleware/validation');
const { 
    generateCode, 
    analyzePrompt, 
    getOperationStats,
    switchAIProvider,
    getProviderInfo,
    testProviderConnection
} = require('../controllers/aiController');
const authenticate = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

// Enhanced rate limiting for different endpoints
const generateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 requests per 15 minutes for generation
    message: {
        error: 'Too many generation requests',
        details: 'Please wait before making another request'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const analyzeLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 60, // 60 requests per 5 minutes for analysis (more lenient)
    message: {
        error: 'Too many analysis requests',
        details: 'Please wait before analyzing another prompt'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const providerLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // 10 provider switches per 10 minutes
    message: {
        error: 'Too many provider switch requests',
        details: 'Please wait before switching providers again'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Generate Lua code based on prompt and game tree
router.post('/generate', 
    authenticate, 
    generateLimiter,
    validateAIRequest, 
    generateCode
);

// Public generate endpoint (no authentication required for testing)
router.post('/generate-public',
    generateLimiter,
    validateAIRequest,
    generateCode
);

// Analyze prompt without executing (lighter operation)
router.post('/analyze', 
    authenticate,
    analyzeLimiter,
    validateAnalyzeRequest,
    analyzePrompt
);

// Get operation statistics
router.get('/stats', 
    authenticate,
    getOperationStats
);

// NEW MULTI-PROVIDER ENDPOINTS

// Switch AI provider
router.post('/provider/switch',
    authenticate,
    providerLimiter,
    switchAIProvider
);

// Get current provider information
router.get('/provider/info',
    authenticate,
    getProviderInfo
);

// Get provider info without authentication (for public use)
router.get('/provider/info-public',
    getProviderInfo
);

// Test provider connection
router.get('/provider/test',
    authenticate,
    testProviderConnection
);

// Health check for AI service
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Multi-Provider AI Generation Service',
        version: '2.1.0',
        features: [
            'multi_provider_support',
            'automatic_fallback',
            'direct_edit_mode',
            'script_generation_mode', 
            'batch_operations',
            'smart_property_parsing',
            'line_level_script_editing',
            'prompt_analysis',
            'operation_statistics'
        ],
        supportedProviders: [
            'OpenRouter',
            'OpenAI',
            'Anthropic Claude',
            'Google Gemini'
        ],
        timestamp: new Date().toISOString()
    });
});

// Enhanced endpoint information
router.get('/info', authenticate, (req, res) => {
    res.json({
        endpoints: {
            generate: {
                path: '/api/ai/generate',
                method: 'POST',
                description: 'Generate and apply AI operations to Roblox instances',
                rateLimit: '30 requests per 15 minutes',
                requiredAuth: true,
                parameters: {
                    prompt: { type: 'string', required: true, maxLength: 2000 },
                    gameTree: { type: 'object', required: true },
                    mode: { type: 'string', enum: ['direct_edit', 'script_generation', 'auto'], default: 'auto' },
                    requestSize: { type: 'string', enum: ['small', 'medium', 'large'], default: 'medium' },
                    selectedInstances: { type: 'array', required: false },
                    provider: { type: 'string', required: false, description: 'Specific AI provider to use' }
                }
            },
            generatePublic: {
                path: '/api/ai/generate-public',
                method: 'POST',
                description: 'Public generation endpoint (no authentication)',
                rateLimit: '30 requests per 15 minutes',
                requiredAuth: false,
                parameters: 'Same as /generate'
            },
            analyze: {
                path: '/api/ai/analyze',
                method: 'POST',
                description: 'Analyze prompt complexity and suggest optimal approach',
                rateLimit: '60 requests per 5 minutes',
                requiredAuth: true,
                parameters: {
                    prompt: { type: 'string', required: true },
                    gameTree: { type: 'object', required: false },
                    selectedInstances: { type: 'array', required: false }
                }
            },
            switchProvider: {
                path: '/api/ai/provider/switch',
                method: 'POST',
                description: 'Switch to a different AI provider',
                rateLimit: '10 requests per 10 minutes',
                requiredAuth: true,
                parameters: {
                    provider: { 
                        type: 'string', 
                        required: true, 
                        enum: ['openrouter', 'openai', 'anthropic', 'google'],
                        description: 'Provider to switch to'
                    }
                }
            },
            providerInfo: {
                path: '/api/ai/provider/info',
                method: 'GET',
                description: 'Get current provider and available providers',
                requiredAuth: true
            },
            providerTest: {
                path: '/api/ai/provider/test',
                method: 'GET',
                description: 'Test connection to current or specified provider',
                requiredAuth: true,
                parameters: {
                    provider: { type: 'query', required: false, description: 'Provider to test (optional)' }
                }
            },
            stats: {
                path: '/api/ai/stats',
                method: 'GET',
                description: 'Get usage statistics and operation history',
                requiredAuth: true
            }
        },
        providers: {
            openrouter: {
                name: 'OpenRouter',
                description: 'Access to multiple models through OpenRouter API',
                models: ['deepseek/deepseek-r1-0528:free', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4-turbo', 'google/gemini-pro'],
                keyRequired: 'OPENROUTER_API_KEY'
            },
            openai: {
                name: 'OpenAI',
                description: 'Direct access to OpenAI GPT models',
                models: ['gpt-4-turbo-preview', 'gpt-4', 'gpt-3.5-turbo'],
                keyRequired: 'OPENAI_API_KEY'
            },
            anthropic: {
                name: 'Anthropic Claude',
                description: 'Direct access to Claude models',
                models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
                keyRequired: 'ANTHROPIC_API_KEY'
            },
            google: {
                name: 'Google Gemini',
                description: 'Direct access to Google Gemini models',
                models: ['gemini-pro', 'gemini-pro-vision'],
                keyRequired: 'GOOGLE_API_KEY'
            }
        },
        modes: {
            direct_edit: {
                description: 'Directly modify existing instances and scripts without creating new ones',
                bestFor: ['Property changes', 'Deletions', 'Simple modifications', 'Batch operations'],
                operations: ['modify_instance', 'edit_script', 'delete_instance']
            },
            script_generation: {
                description: 'Create new scripts and instances for complex functionality',
                bestFor: ['New behaviors', 'Complex logic', 'Event handling', 'Animations'],
                operations: ['create_script', 'create_instance']
            },
            auto: {
                description: 'Automatically determine the best mode based on the prompt',
                bestFor: ['General use', 'When unsure which mode to use'],
                operations: 'Depends on analysis'
            }
        },
        propertyTypes: [
            'Vector3', 'UDim2', 'Color3', 'CFrame', 'BrickColor', 
            'Material', 'number', 'boolean', 'string'
        ],
        supportedClasses: [
            'BasePart', 'Model', 'Folder', 'Script', 'LocalScript', 'ModuleScript',
            'ScreenGui', 'Frame', 'TextLabel', 'TextButton', 'ImageLabel',
            'SpawnLocation', 'Decal', 'SurfaceGui', 'BillboardGui'
        ]
    });
    
});

module.exports = router;