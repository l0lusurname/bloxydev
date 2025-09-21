// AI Dev Assistant Backend Server with Claude 3.5 Sonnet
// server.js

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Validate required environment variables
if (!ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY is required');
    process.exit(1);
}

// Initialize clients
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? 
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const anthropic = new Anthropic({
    apiKey: ANTHROPIC_API_KEY,
});

// Middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:3000', 'https://www.roblox.com', 'roblox-studio://'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting - more generous for development
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // requests per window per IP
    message: {
        success: false,
        error: 'Too many requests. Please wait before trying again.'
    }
});
app.use('/api', limiter);

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} - ${req.method} ${req.path}`);
    next();
});

// Utility Functions

function sanitizeLuaCode(code) {
    // Remove potentially dangerous patterns while preserving functionality
    return code
        .replace(/--\[\[[\s\S]*?\]\]/g, '') // Remove block comments
        .replace(/--[^\r\n]*/g, '') // Remove line comments
        .trim();
}

function analyzeLuaScript(scriptData, gameContext) {
    const analysis = {
        complexity: 'medium',
        patterns: [],
        issues: [],
        suggestions: [],
        security: []
    };
    
    const code = scriptData.source;
    
    // Analyze complexity
    const lineCount = code.split('\n').length;
    const functionCount = (code.match(/function\s+\w+/g) || []).length;
    const serviceCount = (code.match(/game:GetService\(/g) || []).length;
    
    if (lineCount > 200 || functionCount > 10) {
        analysis.complexity = 'high';
    } else if (lineCount < 50 && functionCount < 3) {
        analysis.complexity = 'low';
    }
    
    // Detect patterns
    if (code.includes('RunService.Heartbeat')) {
        analysis.patterns.push('performance_sensitive');
    }
    if (code.includes('RemoteEvent') || code.includes('RemoteFunction')) {
        analysis.patterns.push('networking');
    }
    if (code.includes('TweenService') || code.includes('TweenInfo')) {
        analysis.patterns.push('animation');
    }
    if (code.includes('UserInputService') || code.includes('ContextActionService')) {
        analysis.patterns.push('user_input');
    }
    
    // Detect potential issues
    if (code.includes('wait()') && !code.includes('task.wait()')) {
        analysis.issues.push('deprecated_wait');
    }
    if (code.includes('spawn(') && !code.includes('task.spawn(')) {
        analysis.issues.push('deprecated_spawn');
    }
    if (code.includes('while true do') && !code.includes('RunService')) {
        analysis.issues.push('infinite_loop_risk');
    }
    
    // Security checks
    if (code.includes('loadstring') || code.includes('require(')) {
        analysis.security.push('code_execution_risk');
    }
    if (code.includes('HttpService') && code.includes('GetAsync')) {
        analysis.security.push('external_requests');
    }
    
    return analysis;
}

function buildClaudePrompt(requestData) {
    const { scriptData, gameContext, relatedScripts, relevantAssets } = requestData;
    
    let prompt = `You are an expert Roblox Lua developer analyzing and improving scripts. Here's the context:

TARGET SCRIPT:
Name: ${scriptData.name}
Type: ${scriptData.className}
Location: ${scriptData.path}
Parent Service: ${scriptData.parentService}

SCRIPT CODE:
\`\`\`lua
${scriptData.source}
\`\`\`

GAME CONTEXT:
- Total Objects: ${gameContext.totalObjects}
- Total Scripts: ${gameContext.scriptCount}
- Services in use: ${Object.keys(gameContext.services).join(', ')}`;

    if (relatedScripts && relatedScripts.length > 0) {
        prompt += `\n\nRELATED SCRIPTS (${relatedScripts.length} found):`;
        relatedScripts.slice(0, 3).forEach(script => {
            prompt += `\n- ${script.name} (${script.className}) - ${script.relationship}`;
            if (script.sourcePreview) {
                prompt += `\n  Preview: ${script.sourcePreview}`;
            }
        });
    }

    if (relevantAssets && relevantAssets.length > 0) {
        prompt += `\n\nRELEVANT GAME ASSETS:`;
        relevantAssets.forEach(asset => {
            prompt += `\n- ${asset.name} (${asset.className}) at ${asset.path}`;
        });
    }

    prompt += `\n\nPLEASE PROVIDE:

1. **ANALYSIS**: Analyze the script's purpose, current implementation, and how it fits in the game structure.

2. **IMPROVED CODE**: Provide an optimized version that:
   - Uses modern Roblox Lua best practices (task.wait instead of wait, etc.)
   - Improves performance and readability
   - Handles errors gracefully
   - Follows proper coding conventions
   - Considers the game context and related scripts

3. **EXPLANATION**: Explain what changes you made and why.

4. **RECOMMENDATIONS**: Suggest architectural improvements or alternative approaches.

5. **PERFORMANCE NOTES**: Highlight any performance considerations or optimizations.

Focus on practical, working code that integrates well with the existing game structure. Consider the script's role in the broader game context.`;

    return prompt;
}

// Database functions (with fallbacks if Supabase not configured)
async function getUserCredits(userId) {
    if (!supabase) return 100; // Default credits for development
    
    try {
        const { data, error } = await supabase
            .from('user_credits')
            .select('credits')
            .eq('user_id', userId)
            .single();
        
        if (error && error.code !== 'PGRST116') { // Not found is okay
            console.error('Error fetching user credits:', error);
            return 0;
        }
        
        return data?.credits || 0;
    } catch (error) {
        console.error('Database error:', error);
        return 0;
    }
}

async function deductCredits(userId, amount) {
    if (!supabase) return true; // Skip for development
    
    try {
        const { error } = await supabase.rpc('deduct_user_credits', {
            user_id_param: userId,
            amount: amount
        });
        
        return !error;
    } catch (error) {
        console.error('Error deducting credits:', error);
        return false;
    }
}

async function logRequest(userId, requestType, scriptName, status, tokensUsed = 0) {
    if (!supabase) {
        console.log(`LOG: User ${userId} - ${requestType} - ${scriptName} - ${status} - ${tokensUsed} tokens`);
        return;
    }
    
    try {
        await supabase
            .from('request_logs')
            .insert([
                {
                    user_id: userId,
                    request_type: requestType,
                    script_name: scriptName,
                    status: status,
                    processing_time_ms: 0,
                    credits_used: Math.ceil(tokensUsed / 1000), // 1 credit per 1000 tokens
                    timestamp: new Date().toISOString()
                }
            ]);
    } catch (error) {
        console.error('Error logging request:', error);
    }
}

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        ai: 'Claude 3.5 Sonnet',
        database: supabase ? 'connected' : 'disabled'
    });
});

// Get user credits
app.get('/api/credits/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const credits = await getUserCredits(parseInt(userId));
        
        res.json({
            success: true,
            credits: credits
        });
    } catch (error) {
        console.error('Error getting credits:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve credits'
        });
    }
});

// Main Claude analysis endpoint
app.post('/api/claude-analysis', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { userId, scriptData, gameContext, relatedScripts, relevantAssets, analysisType } = req.body;
        
        // Validate request
        if (!userId || !scriptData || !scriptData.source) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId, scriptData, or source code'
            });
        }
        
        console.log(`🤖 Starting Claude analysis for user ${userId}`);
        console.log(`📜 Script: ${scriptData.name} (${scriptData.source.length} characters)`);
        
        // Check user credits
        const credits = await getUserCredits(userId);
        if (credits < 1) {
            return res.status(402).json({
                success: false,
                error: 'Insufficient credits. Please purchase more credits to continue.',
                creditsAvailable: credits
            });
        }
        
        // Log request start
        await logRequest(userId, 'claude_analysis', scriptData.name, 'processing');
        
        // Analyze script for better context
        const scriptAnalysis = analyzeLuaScript(scriptData, gameContext);
        console.log(`📊 Script analysis: ${scriptAnalysis.complexity} complexity, ${scriptAnalysis.patterns.length} patterns, ${scriptAnalysis.issues.length} issues`);
        
        // Build comprehensive prompt
        const prompt = buildClaudePrompt(req.body);
        console.log(`📝 Prompt size: ${prompt.length} characters`);
        
        // Call Claude 3.5 Sonnet
        const message = await anthropic.messages.create({
            model: "claude-3-5-sonnet-20241022",
            max_tokens: 4000,
            temperature: 0.1,
            messages: [{
                role: "user",
                content: prompt
            }]
        });
        
        const claudeResponse = message.content[0].text;
        const tokensUsed = message.usage.input_tokens + message.usage.output_tokens;
        
        console.log(`✅ Claude response received (${tokensUsed} tokens)`);
        
        // Parse Claude's response into structured format
        const responseData = parseClaudeResponse(claudeResponse, scriptData.source);
        
        // Deduct credits
        const creditsToDeduct = Math.max(1, Math.ceil(tokensUsed / 1000));
        await deductCredits(userId, creditsToDeduct);
        
        // Log successful completion
        await logRequest(userId, 'claude_analysis', scriptData.name, 'completed', tokensUsed);
        
        const processingTime = Date.now() - startTime;
        console.log(`🎉 Analysis completed in ${processingTime}ms`);
        
        res.json({
            success: true,
            ...responseData,
            tokensUsed: tokensUsed,
            creditsUsed: creditsToDeduct,
            creditsRemaining: credits - creditsToDeduct,
            processingTimeMs: processingTime,
            scriptAnalysis: scriptAnalysis
        });
        
    } catch (error) {
        console.error('❌ Error processing Claude request:', error);
        
        // Log error
        if (req.body.userId && req.body.scriptData) {
            await logRequest(req.body.userId, 'claude_analysis', req.body.scriptData.name, 'error');
        }
        
        res.status(500).json({
            success: false,
            error: 'Analysis failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Parse Claude's response into structured components
function parseClaudeResponse(claudeText, originalCode) {
    const response = {
        analysis: '',
        improvedCode: originalCode,
        explanation: '',
        recommendations: '',
        performanceNotes: ''
    };
    
    try {
        // Extract sections using regex patterns
        const sections = {
            analysis: /(?:\*\*ANALYSIS\*\*|1\.\s*\*\*ANALYSIS\*\*):\s*([\s\S]*?)(?=\*\*|$)/i,
            code: /(?:\*\*IMPROVED CODE\*\*|2\.\s*\*\*IMPROVED CODE\*\*)[\s\S]*?```lua([\s\S]*?)```/i,
            explanation: /(?:\*\*EXPLANATION\*\*|3\.\s*\*\*EXPLANATION\*\*):\s*([\s\S]*?)(?=\*\*|$)/i,
            recommendations: /(?:\*\*RECOMMENDATIONS\*\*|4\.\s*\*\*RECOMMENDATIONS\*\*):\s*([\s\S]*?)(?=\*\*|$)/i,
            performance: /(?:\*\*PERFORMANCE NOTES\*\*|5\.\s*\*\*PERFORMANCE NOTES\*\*):\s*([\s\S]*?)(?=\*\*|$)/i
        };
        
        // Extract each section
        for (const [key, regex] of Object.entries(sections)) {
            const match = claudeText.match(regex);
            if (match) {
                const content = match[1].trim();
                switch (key) {
                    case 'analysis':
                        response.analysis = content;
                        break;
                    case 'code':
                        response.improvedCode = sanitizeLuaCode(content);
                        break;
                    case 'explanation':
                        response.explanation = content;
                        break;
                    case 'recommendations':
                        response.recommendations = content;
                        break;
                    case 'performance':
                        response.performanceNotes = content;
                        break;
                }
            }
        }
        
        // Fallback: if no structured sections found, use the entire response
        if (!response.analysis && !response.explanation) {
            response.analysis = claudeText;
        }
        
    } catch (error) {
        console.error('Error parsing Claude response:', error);
        response.analysis = claudeText;
    }
    
    return response;
}

// Legacy endpoint for backward compatibility
app.post('/api/ai-help', async (req, res) => {
    // Redirect to new Claude endpoint with adapted format
    const adaptedRequest = {
        userId: req.body.userId,
        scriptData: {
            name: req.body.scriptName,
            className: req.body.scriptType || 'Script',
            source: req.body.scriptContent,
            path: req.body.scriptName,
            parentService: 'Unknown'
        },
        gameContext: {
            totalObjects: 0,
            scriptCount: 1,
            services: {}
        },
        relatedScripts: [],
        relevantAssets: [],
        analysisType: 'basic'
    };
    
    req.body = adaptedRequest;
    
    // Forward to Claude analysis
    app.handle(Object.assign(req, { path: '/api/claude-analysis', method: 'POST' }), res);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 AI Dev Assistant Backend running on port ${PORT}`);
    console.log(`🤖 Powered by Claude 3.5 Sonnet`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔧 Analysis endpoint: http://localhost:${PORT}/api/claude-analysis`);
    console.log(`💾 Database: ${supabase ? 'Connected' : 'Disabled (dev mode)'}`);
    
    if (!ANTHROPIC_API_KEY) {
        console.warn('⚠️  Warning: ANTHROPIC_API_KEY not configured');
    }
});