const { generateLuaCode, validateOperations } = require('../services/aiService');
const logger = require('../utils/logger');

const generateCode = async (req, res, next) => {
    try {
        const { 
            prompt, 
            gameTree, 
            requestSize = 'medium',
            mode = 'direct_edit',
            selectedInstances = []
        } = req.body;
        
        logger.info(`Processing request in ${mode} mode:`, {
            prompt: prompt.substring(0, 100),
            selectedCount: selectedInstances.length,
            requestSize
        });

        // Input validation
        if (!prompt || prompt.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Prompt is required'
            });
        }

        if (prompt.length > 2000) {
            return res.status(400).json({
                success: false,
                error: 'Prompt is too long (max 2000 characters)'
            });
        }

        // Analyze prompt for complexity and estimate credit usage
        const complexityScore = analyzePromptComplexity(prompt, gameTree, selectedInstances);
        const estimatedCredits = calculateCreditUsage(complexityScore, mode, requestSize);

        logger.info('Request analysis:', {
            complexity: complexityScore,
            estimatedCredits,
            mode
        });

        // Generate AI response
        const startTime = Date.now();
        const generatedCode = await generateLuaCode(
            prompt, 
            gameTree, 
            requestSize, 
            mode, 
            selectedInstances
        );
        const processingTime = Date.now() - startTime;

        logger.info('AI generation completed:', {
            processingTime: `${processingTime}ms`,
            operationsCount: getOperationCount(generatedCode)
        });

        // Validate and sanitize operations if in direct edit mode
        if (mode === 'direct_edit' && generatedCode.modifications) {
            const validatedOps = validateOperations(generatedCode.modifications || []);
            generatedCode.modifications = validatedOps;
        }

        // Enhanced response with metadata
        res.json({
            success: true,
            data: generatedCode,
            metadata: {
                processingTime,
                complexity: complexityScore,
                estimatedCredits,
                mode,
                operationsCount: getOperationCount(generatedCode),
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        logger.error('Error generating code:', {
            error: error.message,
            stack: error.stack,
            prompt: req.body.prompt?.substring(0, 100)
        });

        // Handle specific error types
        if (error.message.includes('timeout')) {
            return res.status(408).json({
                success: false,
                error: 'Request timeout - try a simpler prompt',
                details: 'The AI service took too long to respond'
            });
        }

        if (error.message.includes('rate limit')) {
            return res.status(429).json({
                success: false,
                error: 'Rate limit exceeded',
                details: 'Please wait before making another request'
            });
        }

        if (error.message.includes('credits')) {
            return res.status(402).json({
                success: false,
                error: 'Insufficient credits',
                details: error.message
            });
        }

        next(error);
    }
};

const analyzePromptComplexity = (prompt, gameTree, selectedInstances) => {
    let complexity = 0;

    // Base complexity from prompt length and content
    complexity += Math.min(prompt.length / 100, 5);

    // Keywords that indicate complex operations
    const complexKeywords = [
        'all', 'every', 'each', 'find', 'search', 'batch', 'recursive',
        'optimize', 'refactor', 'algorithm', 'pathfinding', 'ai', 'machine learning'
    ];
    
    const simpleKeywords = [
        'color', 'size', 'position', 'delete', 'create', 'move', 'rotate'
    ];

    const lowerPrompt = prompt.toLowerCase();
    
    complexKeywords.forEach(keyword => {
        if (lowerPrompt.includes(keyword)) {
            complexity += 2;
        }
    });

    simpleKeywords.forEach(keyword => {
        if (lowerPrompt.includes(keyword)) {
            complexity += 0.5;
        }
    });

    // Game tree size factor
    if (gameTree) {
        const treeSize = estimateGameTreeSize(gameTree);
        complexity += Math.min(treeSize / 100, 3);
    }

    // Selection complexity
    if (selectedInstances && selectedInstances.length > 0) {
        complexity += Math.min(selectedInstances.length / 10, 2);
    }

    // Script-related operations are more complex
    if (lowerPrompt.includes('script') || lowerPrompt.includes('code') || lowerPrompt.includes('function')) {
        complexity += 3;
    }

    return Math.min(complexity, 10); // Cap at 10
};

const estimateGameTreeSize = (gameTree) => {
    let size = 0;
    
    const countNodes = (node) => {
        if (!node) return 0;
        let count = 1;
        if (node.Children && Array.isArray(node.Children)) {
            node.Children.forEach(child => {
                count += countNodes(child);
            });
        }
        return count;
    };

    Object.values(gameTree).forEach(service => {
        size += countNodes(service);
    });

    return size;
};

const calculateCreditUsage = (complexity, mode, requestSize) => {
    let baseCredits = 1;

    // Mode multiplier
    const modeMultipliers = {
        'direct_edit': 1.2, // Slightly more expensive due to precision required
        'script_generation': 1.0
    };

    // Size multiplier
    const sizeMultipliers = {
        'small': 0.7,
        'medium': 1.0,
        'large': 1.5
    };

    // Complexity multiplier
    const complexityMultiplier = 1 + (complexity / 10);

    const totalCredits = baseCredits * 
        (modeMultipliers[mode] || 1.0) * 
        (sizeMultipliers[requestSize] || 1.0) * 
        complexityMultiplier;

    return Math.ceil(totalCredits);
};

const getOperationCount = (generatedCode) => {
    let count = 0;
    
    if (generatedCode.modifications) count += generatedCode.modifications.length;
    if (generatedCode.scriptEdits) count += generatedCode.scriptEdits.length;
    if (generatedCode.deletions) count += generatedCode.deletions.length;
    if (generatedCode.instances) count += generatedCode.instances.length;
    if (generatedCode.scripts) count += generatedCode.scripts.length;

    return count;
};

// New endpoint for analyzing prompts without executing
const analyzePrompt = async (req, res, next) => {
    try {
        const { prompt, gameTree, selectedInstances = [] } = req.body;

        if (!prompt) {
            return res.status(400).json({
                success: false,
                error: 'Prompt is required'
            });
        }

        const complexity = analyzePromptComplexity(prompt, gameTree, selectedInstances);
        const suggestedMode = suggestOptimalMode(prompt, complexity);
        const estimatedCredits = calculateCreditUsage(complexity, suggestedMode, 'medium');

        // Analyze what the AI might do
        const analysis = analyzePromptIntent(prompt);

        res.json({
            success: true,
            analysis: {
                complexity,
                suggestedMode,
                estimatedCredits,
                intent: analysis,
                suggestions: generatePromptSuggestions(prompt, analysis)
            }
        });

    } catch (error) {
        logger.error('Error analyzing prompt:', error);
        next(error);
    }
};

const suggestOptimalMode = (prompt, complexity) => {
    const lowerPrompt = prompt.toLowerCase();
    
    // Direct edit is better for simple property changes
    const directEditKeywords = [
        'color', 'size', 'position', 'delete', 'move', 'anchor', 'material',
        'transparency', 'brightness', 'volume'
    ];
    
    // Script generation is better for complex logic
    const scriptGenKeywords = [
        'script', 'function', 'behavior', 'animation', 'tween', 'loop',
        'event', 'trigger', 'collision', 'mouse', 'keyboard'
    ];

    const directEditScore = directEditKeywords.reduce((score, keyword) => {
        return lowerPrompt.includes(keyword) ? score + 1 : score;
    }, 0);

    const scriptGenScore = scriptGenKeywords.reduce((score, keyword) => {
        return lowerPrompt.includes(keyword) ? score + 1 : score;
    }, 0);

    // For high complexity operations, prefer script generation
    if (complexity > 7) return 'script_generation';
    
    // If script keywords are dominant, use script generation
    if (scriptGenScore > directEditScore) return 'script_generation';
    
    // Default to direct edit for simpler operations
    return 'direct_edit';
};

const analyzePromptIntent = (prompt) => {
    const lowerPrompt = prompt.toLowerCase();
    const intents = [];

    // Analyze different types of operations
    if (lowerPrompt.includes('delete') || lowerPrompt.includes('remove')) {
        intents.push({
            type: 'deletion',
            confidence: 0.9,
            description: 'Will delete or remove instances'
        });
    }

    if (lowerPrompt.includes('color') || lowerPrompt.includes('material')) {
        intents.push({
            type: 'visual_modification',
            confidence: 0.8,
            description: 'Will modify visual properties'
        });
    }

    if (lowerPrompt.includes('size') || lowerPrompt.includes('scale')) {
        intents.push({
            type: 'size_modification',
            confidence: 0.8,
            description: 'Will modify size or scale'
        });
    }

    if (lowerPrompt.includes('script') || lowerPrompt.includes('code')) {
        intents.push({
            type: 'script_operation',
            confidence: 0.9,
            description: 'Will create or modify scripts'
        });
    }

    if (lowerPrompt.includes('all') || lowerPrompt.includes('every')) {
        intents.push({
            type: 'batch_operation',
            confidence: 0.7,
            description: 'Will perform batch operations on multiple instances'
        });
    }

    return intents;
};

const generatePromptSuggestions = (prompt, analysis) => {
    const suggestions = [];

    // Suggest more specific prompts
    if (prompt.length < 20) {
        suggestions.push({
            type: 'specificity',
            message: 'Consider adding more details about what you want to modify',
            example: 'Instead of "make red", try "make all parts in Workspace red"'
        });
    }

    // Suggest efficiency improvements
    const hasAll = prompt.toLowerCase().includes('all');
    if (hasAll && analysis.some(a => a.type === 'batch_operation')) {
        suggestions.push({
            type: 'efficiency',
            message: 'Batch operations detected - this might take longer to process',
            example: 'Consider selecting specific instances first to limit the scope'
        });
    }

    // Suggest safety considerations
    if (analysis.some(a => a.type === 'deletion')) {
        suggestions.push({
            type: 'safety',
            message: 'Deletion operations cannot be easily undone',
            example: 'Consider creating a backup or being more specific about what to delete'
        });
    }

    return suggestions;
};

// New endpoint for getting operation history/statistics
const getOperationStats = async (req, res, next) => {
    try {
        // This would typically come from a database
        // For now, return mock statistics
        const stats = {
            totalOperations: 0,
            successRate: 0,
            mostCommonOperations: [],
            averageComplexity: 0,
            creditsUsed: 0
        };

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        logger.error('Error getting operation stats:', error);
        next(error);
    }
};

module.exports = {
    generateCode,
    analyzePrompt,
    getOperationStats
};