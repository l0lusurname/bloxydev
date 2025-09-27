const Joi = require('joi');
const logger = require('../utils/logger');

// Validate operations response from AI (for direct edit mode)
const validateOperationsResponse = (operations) => {
    if (!Array.isArray(operations)) {
        return { valid: false, errors: ['Operations must be an array'] };
    }
    
    const errors = [];
    const validatedOps = [];
    
    operations.forEach((op, index) => {
        try {
            let schema;
            
            switch (op.type) {
                case 'modify_instance':
                    schema = modifyInstanceSchema;
                    break;
                case 'edit_script':
                    schema = editScriptSchema;
                    break;
                case 'delete_instance':
                    schema = deleteInstanceSchema;
                    break;
                default:
                    errors.push(`Operation ${index}: Unknown operation type '${op.type}'`);
                    return;
            }
            
            const { error, value } = schema.validate(op);
            
            if (error) {
                errors.push(`Operation ${index}: ${error.details.map(d => d.message).join(', ')}`);
            } else {
                validatedOps.push(value);
            }
            
        } catch (err) {
            errors.push(`Operation ${index}: Validation error - ${err.message}`);
        }
    });
    
    return {
        valid: errors.length === 0,
        errors,
        validatedOperations: validatedOps
    };
};

// Sanitize user input to prevent potential security issues
const sanitizePrompt = (prompt) => {
    return prompt
        .replace(/[<>]/g, '') // Remove potential HTML/XML tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/data:/gi, '') // Remove data: protocol
        .trim();
};

// Rate limiting validation
const validateRateLimit = (req, res, next) => {
    const userIdentifier = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    
    // Check if user has made too many requests recently
    // This would typically use Redis or similar for production
    logger.info(`Request from ${userIdentifier}`, {
        endpoint: req.path,
        method: req.method
    });
    
    next();
};

// Additional security middleware
const validateSecurity = (req, res, next) => {
    try {
        // Check request size
        const contentLength = parseInt(req.headers['content-length'] || '0');
        const maxSize = 50 * 1024 * 1024; // 50MB max
        
        if (contentLength > maxSize) {
            return res.status(413).json({
                success: false,
                error: 'Request too large',
                details: 'Request exceeds maximum allowed size'
            });
        }
        
        // Sanitize prompt if present
        if (req.body.prompt) {
            req.body.prompt = sanitizePrompt(req.body.prompt);
        }
        
        // Check for suspicious patterns
        const suspiciousPatterns = [
            /\b(eval|exec|system|shell|cmd)\s*\(/i,
            /\b(require|import)\s*\(/i,
            /<script[^>]*>/i,
            /javascript:/i,
            /on\w+\s*=/i
        ];
        
        const requestBody = JSON.stringify(req.body);
        
        for (const pattern of suspiciousPatterns) {
            if (pattern.test(requestBody)) {
                logger.warn('Suspicious request detected', {
                    ip: req.ip,
                    pattern: pattern.source,
                    body: requestBody.substring(0, 200)
                });
                
                return res.status(400).json({
                    success: false,
                    error: 'Invalid request content',
                    details: 'Request contains potentially harmful content'
                });
            }
        }
        
        next();
        
    } catch (error) {
        logger.error('Security validation error:', error);
        next(error);
    }
};

module.exports = {
    validateAIRequest,
    validateAnalyzeRequest,
    validateGameTree,
    validateOperationsResponse,
    validateRateLimit,
    validateSecurity,
    sanitizePrompt
}; Enhanced game tree schema with more detailed validation
const gameTreeSchema = Joi.object({
    Workspace: Joi.object().required(),
    StarterGui: Joi.object().optional(),
    ReplicatedStorage: Joi.object().optional(),
    ServerStorage: Joi.object().optional(),
    Players: Joi.object().optional(),
    Lighting: Joi.object().optional()
}).unknown(true); // Allow additional services

// Selected instance schema
const selectedInstanceSchema = Joi.object({
    name: Joi.string().required(),
    className: Joi.string().required(),
    path: Joi.array().items(Joi.string()).required()
});

// Enhanced AI request schema with new fields
const aiRequestSchema = Joi.object({
    prompt: Joi.string()
        .required()
        .min(3)
        .max(2000)
        .pattern(/^[^<>{}]*$/) // Prevent potential injection attacks
        .messages({
            'string.min': 'Prompt must be at least 3 characters long',
            'string.max': 'Prompt must be less than 2000 characters',
            'string.pattern.base': 'Prompt contains invalid characters'
        }),
    
    gameTree: gameTreeSchema.required(),
    
    requestSize: Joi.string()
        .valid('small', 'medium', 'large')
        .default('medium'),
    
    mode: Joi.string()
        .valid('direct_edit', 'script_generation', 'auto')
        .default('auto'), // Auto-determine mode based on prompt
    
    selectedInstances: Joi.array()
        .items(selectedInstanceSchema)
        .max(50) // Reasonable limit to prevent abuse
        .default([])
});

// Schema for analyze endpoint
const analyzeRequestSchema = Joi.object({
    prompt: Joi.string()
        .required()
        .min(3)
        .max(2000)
        .pattern(/^[^<>{}]*$/),
    
    gameTree: gameTreeSchema.optional(),
    
    selectedInstances: Joi.array()
        .items(selectedInstanceSchema)
        .max(50)
        .default([])
});

// Property value validation schema
const propertyValueSchema = Joi.object({
    type: Joi.string().valid(
        'Vector3', 'UDim2', 'Color3', 'CFrame', 'BrickColor', 
        'Material', 'number', 'boolean', 'string'
    ).required(),
    value: Joi.alternatives().try(
        Joi.string(),
        Joi.number(),
        Joi.boolean()
    ).required()
});

// Operation schemas for direct edit mode
const modifyInstanceSchema = Joi.object({
    type: Joi.string().valid('modify_instance').required(),
    path: Joi.array().items(Joi.string()).min(1).required(),
    properties: Joi.object().pattern(
        Joi.string(),
        Joi.alternatives().try(
            propertyValueSchema,
            Joi.string(),
            Joi.number(),
            Joi.boolean()
        )
    ).required()
});

const editScriptSchema = Joi.object({
    type: Joi.string().valid('edit_script').required(),
    path: Joi.array().items(Joi.string()).min(1).required(),
    modifications: Joi.array().items(
        Joi.object({
            action: Joi.string().valid('replace', 'insert', 'delete', 'append').required(),
            lineNumber: Joi.number().integer().min(1).when('action', {
                is: Joi.string().valid('replace', 'insert', 'delete'),
                then: Joi.required(),
                otherwise: Joi.optional()
            }),
            content: Joi.string().when('action', {
                is: Joi.string().valid('insert', 'append'),
                then: Joi.required(),
                otherwise: Joi.optional()
            }),
            newContent: Joi.string().when('action', {
                is: 'replace',
                then: Joi.required(),
                otherwise: Joi.optional()
            })
        })
    ).min(1).required()
});

const deleteInstanceSchema = Joi.object({
    type: Joi.string().valid('delete_instance').required(),
    path: Joi.array().items(Joi.string()).min(1).required()
});

// Main validation functions
const validateAIRequest = async (req, res, next) => {
    try {
        // Validate the main request
        const validatedBody = await aiRequestSchema.validateAsync(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        
        // Additional custom validations
        const validationErrors = [];
        
        // Check for potentially dangerous prompts
        const dangerousKeywords = ['system', 'admin', 'root', 'delete all', 'format', 'destroy everything'];
        const promptLower = validatedBody.prompt.toLowerCase();
        
        const hasDangerousContent = dangerousKeywords.some(keyword => 
            promptLower.includes(keyword)
        );
        
        if (hasDangerousContent) {
            validationErrors.push('Prompt contains potentially dangerous keywords');
        }
        
        // Validate game tree structure
        if (!validateGameTreeStructure(validatedBody.gameTree)) {
            validationErrors.push('Game tree structure is invalid or corrupted');
        }
        
        // Check selected instances validity
        if (validatedBody.selectedInstances.length > 0) {
            const invalidInstances = validateSelectedInstances(validatedBody.selectedInstances);
            if (invalidInstances.length > 0) {
                validationErrors.push(`Invalid selected instances: ${invalidInstances.join(', ')}`);
            }
        }
        
        if (validationErrors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: validationErrors
            });
        }
        
        // Attach validated data to request
        req.body = validatedBody;
        
        logger.info('AI request validated successfully', {
            mode: validatedBody.mode,
            promptLength: validatedBody.prompt.length,
            selectedCount: validatedBody.selectedInstances.length
        });
        
        next();
        
    } catch (error) {
        if (error.isJoi) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));
            
            logger.warn('AI request validation failed', { details });
            
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: details
            });
        }
        
        logger.error('AI request validation error:', error);
        next(error);
    }
};

const validateAnalyzeRequest = async (req, res, next) => {
    try {
        const validatedBody = await analyzeRequestSchema.validateAsync(req.body, {
            abortEarly: false,
            stripUnknown: true
        });
        
        req.body = validatedBody;
        next();
        
    } catch (error) {
        if (error.isJoi) {
            const details = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message
            }));
            
            return res.status(400).json({
                success: false,
                error: 'Analysis validation failed',
                details: details
            });
        }
        
        logger.error('Analyze request validation error:', error);
        next(error);
    }
};

const validateGameTree = async (req, res, next) => {
    try {
        const { gameTree } = req.body;
        
        if (!gameTree) {
            return res.status(400).json({
                success: false,
                error: 'Game tree is required'
            });
        }
        
        await gameTreeSchema.validateAsync(gameTree);
        
        if (!validateGameTreeStructure(gameTree)) {
            return res.status(400).json({
                success: false,
                error: 'Game tree structure is invalid'
            });
        }
        
        next();
        
    } catch (error) {
        logger.error('Game tree validation error:', error);
        
        if (error.isJoi) {
            return res.status(400).json({
                success: false,
                error: 'Game tree validation failed',
                details: error.details.map(d => d.message)
            });
        }
        
        next(error);
    }
};

// Helper validation functions
const validateGameTreeStructure = (gameTree) => {
    try {
        // Check if Workspace exists and has basic structure
        if (!gameTree.Workspace || typeof gameTree.Workspace !== 'object') {
            return false;
        }
        
        // Check for circular references (basic check)
        const seen = new Set();
        
        const checkNode = (node, path = '') => {
            if (seen.has(node)) {
                logger.warn('Circular reference detected in game tree');
                return false;
            }
            
            seen.add(node);
            
            if (node.Children && Array.isArray(node.Children)) {
                for (const child of node.Children) {
                    if (!checkNode(child, path + '/' + (child.Name || 'unnamed'))) {
                        return false;
                    }
                }
            }
            
            seen.delete(node);
            return true;
        };
        
        return Object.values(gameTree).every(service => checkNode(service));
        
    } catch (error) {
        logger.error('Game tree structure validation error:', error);
        return false;
    }
};

const validateSelectedInstances = (instances) => {
    const invalid = [];
    
    instances.forEach((instance, index) => {
        // Check if className is a valid Roblox class
        const validClasses = [
            'Part', 'Model', 'Folder', 'Script', 'LocalScript', 'ModuleScript',
            'ScreenGui', 'Frame', 'TextLabel', 'TextButton', 'ImageLabel',
            'SpawnLocation', 'Decal', 'SurfaceGui', 'BillboardGui', 'MeshPart',
            'UnionOperation', 'WedgePart', 'CornerWedgePart', 'TrussPart'
        ];
        
        if (!validClasses.includes(instance.className)) {
            invalid.push(`Instance ${index}: Unknown class '${instance.className}'`);
        }
        
        // Check path structure
        if (instance.path.length === 0) {
            invalid.push(`Instance ${index}: Empty path`);
        }
        
        // Check for invalid path characters
        const invalidPathChars = /[<>:"|?*]/;
        if (instance.path.some(part => invalidPathChars.test(part))) {
            invalid.push(`Instance ${index}: Invalid characters in path`);
        }
    });
    
    return invalid;
};

//