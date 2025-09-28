const express = require('express');
const router = express.Router();
const { validateAIRequest, validateAnalyzeRequest } = require('../middleware/validation');
const { generateCode, analyzePrompt, getOperationStats } = require('../controllers/aiController');
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

const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per 15 minutes for public endpoint (more restrictive)
    message: {
        error: 'Too many public generation requests',
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

// Generate Lua code based on prompt and game tree (with authentication)
router.post('/generate', 
    authenticate, 
    generateLimiter,
    validateAIRequest, 
    generateCode
);

// Public generate endpoint for Roblox plugin (no auth required)
router.post('/generate-public', 
    publicLimiter,
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

// Health check for AI service
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'AI Generation Service',
        version: '2.0.0',
        features: [
            'direct_edit_mode',
            'script_generation_mode', 
            'batch_operations',
            'smart_property_parsing',
            'line_level_script_editing',
            'prompt_analysis',
            'operation_statistics'
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
                    selectedInstances: { type: 'array', required: false }
                }
            },
            generatePublic: {
                path: '/api/ai/generate-public',
                method: 'POST',
                description: 'Public endpoint for Roblox plugin - no authentication required',
                rateLimit: '10 requests per 15 minutes',
                requiredAuth: false,
                parameters: {
                    prompt: { type: 'string', required: true, maxLength: 2000 },
                    gameTree: { type: 'object', required: true },
                    mode: { type: 'string', enum: ['direct_edit', 'script_generation', 'auto'], default: 'auto' },
                    requestSize: { type: 'string', enum: ['small', 'medium', 'large'], default: 'medium' },
                    selectedInstances: { type: 'array', required: false }
                }
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
            stats: {
                path: '/api/ai/stats',
                method: 'GET',
                description: 'Get usage statistics and operation history',
                requiredAuth: true
            }
        },
        modes: {
            auto: {
                description: 'Automatically determine the best mode based on the prompt',
                bestFor: ['General use', 'When unsure which mode to use']
            },
            direct_edit: {
                description: 'Directly modify existing instances and scripts without creating new ones',
                bestFor: ['Property changes', 'Deletions', 'Simple modifications', 'Batch operations'],
                operations: ['modify_instance', 'edit_script', 'delete_instance']
            },
            script_generation: {
                description: 'Create new scripts and instances for complex functionality',
                bestFor: ['New behaviors', 'Complex logic', 'Event handling', 'Animations'],
                operations: ['create_script', 'create_instance']
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