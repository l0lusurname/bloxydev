const { generateLuaCode, validateOperations } = require('../services/aiService');
const logger = require('../utils/logger');

const generateCode = async (req, res, next) => {
    try {
        const { 
            prompt, 
            gameTree, 
            requestSize = 'medium',
            mode: requestedMode = 'auto',
            selectedInstances = []
        } = req.body;
        
        // Auto-determine mode if requested
        const mode = requestedMode === 'auto' ? 
            determineOptimalMode(prompt, gameTree, selectedInstances) : 
            requestedMode;
        
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

const determineOptimalMode = (prompt, gameTree, selectedInstances) => {
    const lowerPrompt = prompt.toLowerCase();
    let score = { direct_edit: 0, script_generation: 0 };
    
    // Keywords that strongly favor direct editing
    const directEditKeywords = [
        'color', 'size', 'position', 'delete', 'remove', 'move', 'resize',
        'anchor', 'material', 'transparency', 'brightness', 'volume',
        'rotation', 'scale', 'name', 'parent', 'visible', 'enabled'
    ];
    
    // Keywords that favor script generation
    const scriptGenKeywords = [
        'script', 'function', 'behavior', 'animation', 'tween', 'loop',
        'event', 'trigger', 'collision', 'mouse', 'keyboard', 'click',
        'touch', 'timer', 'wait', 'while', 'if', 'when', 'detect',
        'spawn', 'clone', 'gui', 'menu', 'button', 'leaderboard'
    ];
    
    // Complex operation keywords (usually need scripts)
    const complexKeywords = [
        'ai', 'pathfinding', 'algorithm', 'calculate', 'track', 'follow',
        'chase', 'patrol', 'random', 'generate', 'procedural', 'dynamic'
    ];
    
    // Count keyword matches
    directEditKeywords.forEach(keyword => {
        if (lowerPrompt.includes(keyword)) {
            score.direct_edit += 2;
        }
    });
    
    scriptGenKeywords.forEach(keyword => {
        if (lowerPrompt.includes(keyword)) {
            score.script_generation += 2;
        }
    });
    
    complexKeywords.forEach(keyword => {
        if (lowerPrompt.includes(keyword)) {
            score.script_generation += 3;
        }
    });
    
    // Analyze prompt structure for additional clues
    
    // Simple property modifications usually indicate direct edit
    const propertyPatterns = [
        /make.*?red|blue|green|yellow|purple|orange|black|white/,
        /change.*?size|color|position|material/,
        /set.*?to.*?\d/,
        /make.*?bigger|smaller|larger|transparent/
    ];
    
    propertyPatterns.forEach(pattern => {
        if (pattern.test(lowerPrompt)) {
            score.direct_edit += 3;
        }
    });
    
    // Behavioral descriptions usually need scripts
    const behaviorPatterns = [
        /when.*?clicked|touched|hit/,
        /if.*?then/,
        /make.*?move|rotate|spin|bounce/,
        /create.*?that.*?does/,
        /add.*?script|function|behavior/
    ];
    
    behaviorPatterns.forEach(pattern => {
        if (pattern.test(lowerPrompt)) {
            score.script_generation += 3;
        }
    });
    
    // Batch operations often work better with direct edit
    if (lowerPrompt.includes('all ') || lowerPrompt.includes('every ')) {
        // But only if it's not creating new behavior
        if (!lowerPrompt.includes('script') && !lowerPrompt.includes('function')) {
            score.direct_edit += 2;
        }
    }
    
    // Selected instances bias toward direct edit (easier to modify existing)
    if (selectedInstances && selectedInstances.length > 0) {
        score.direct_edit += 1;
    }
    
    // Very short prompts are usually simple modifications
    if (prompt.length < 30) {
        score.direct_edit += 1;
    }
    
    // Very long prompts often describe complex behavior
    if (prompt.length > 100) {
        score.script_generation += 1;
    }
    
    // Determine final mode
    const finalMode = score.direct_edit >= score.script_generation ? 'direct_edit' : 'script_generation';
    
    logger.info('Auto-determined mode:', {
        prompt: prompt.substring(0, 50),
        scores: score,
        selectedMode: finalMode
    });
    
    return finalMode;
};

const suggestOptimalMode = (prompt, complexity) => {
    // This function is kept for backward compatibility but now uses the more sophisticated determineOptimalMode
    return determineOptimalMode(prompt, {}, []);
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