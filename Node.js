// AI Dev Assistant Backend Server with GPT-4 (FREE $5 credits!)
// server.js

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validate required environment variables
if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is required');
    console.error('🔗 Get free $5 credits at: https://platform.openai.com/api-keys');
    process.exit(1);
}

// Initialize clients
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY ? 
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

// Middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:3000', 'https://www.roblox.com', 'roblox-studio://'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting - generous for free tier
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // requests per window per IP (conservative for free tier)
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

function buildGPTPrompt(requestData) {
    const { scriptData, gameContext, relatedScripts, relevantAssets } = requestData;
    
    let prompt = `You are an expert Roblox Lua developer analyzing and improving scripts. Provide a structured response with clear sections.

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

    prompt += `\n\nPROVIDE YOUR RESPONSE IN THIS EXACT FORMAT:

**ANALYSIS**:
[Analyze the script's purpose, current implementation, and how it fits in the game structure]

**IMPROVED CODE**:
\`\`\`lua
[Provide optimized Lua code here using modern Roblox practices]
\`\`\`

**EXPLANATION**:
[Explain what changes you made and why]

**RECOMMENDATIONS**:
[Suggest architectural improvements or alternative approaches]

**PERFORMANCE NOTES**:
[Highlight any performance considerations or optimizations]

Focus on modern Roblox Lua best practices (task.wait instead of wait, proper service usage, error handling, etc.). Consider the script's role in the broader game context.`;

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

async function logRequest(userId, requestType, scriptName, status, tokensUsed = 0) {
    if (!supabase) {
        console.log(`📊 LOG: User ${userId} - ${requestType} - ${scriptName} - ${status} - ${tokensUsed} tokens`);
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
        version: '2.0.0-gpt4',
        ai: 'GPT-4 (FREE $5 Credits)',
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

// Main GPT-4 analysis endpoint
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
        
        console.log(`🤖 Starting GPT-4 analysis for user ${userId}`);
        console.log(`📜 Script: ${scriptData.name} (${scriptData.source.length} characters)`);
        
        // Log request start
        await logRequest(userId, 'gpt4_analysis', scriptData.name, 'processing');
        
        // Analyze script for better context
        const scriptAnalysis = analyzeLuaScript(scriptData, gameContext);
        console.log(`📊 Script analysis: ${scriptAnalysis.complexity} complexity, ${scriptAnalysis.patterns.length} patterns, ${scriptAnalysis.issues.length} issues`);
        
        // Build comprehensive prompt
        const prompt = buildGPTPrompt(req.body);
        console.log(`📝 Prompt size: ${prompt.length} characters`);
        
        // Call GPT-4
        const completion = await openai.chat.completions.create({
            model: "gpt-4", // Using GPT-4 for best results
            messages: [
                {
                    role: "system",
                    content: "You are an expert Roblox Lua developer. Provide structured, helpful analysis and modern code improvements."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 3000,
            temperature: 0.1
        });
        
        const gptResponse = completion.choices[0].message.content;
        const tokensUsed = completion.usage.total_tokens;
        
        console.log(`✅ GPT-4 response received (${tokensUsed} tokens)`);
        
        // Parse GPT's response into structured format
        const responseData = parseGPTResponse(gptResponse, scriptData.source);
        
        // Log successful completion
        await logRequest(userId, 'gpt4_analysis', scriptData.name, 'completed', tokensUsed);
        
        const processingTime = Date.now() - startTime;
        console.log(`🎉 Analysis completed in ${processingTime}ms`);
        
        res.json({
            success: true,
            ...responseData,
            tokensUsed: tokensUsed,
            creditsUsed: Math.ceil(tokensUsed / 1000),
            creditsRemaining: 'Free Tier',
            processingTimeMs: processingTime,
            scriptAnalysis: scriptAnalysis,
            aiModel: 'GPT-4'
        });
        
    } catch (error) {
        console.error('❌ Error processing GPT-4 request:', error);
        
        // Handle specific OpenAI errors
        let errorMessage = 'Analysis failed. Please try again.';
        if (error.status === 401) {
            errorMessage = 'Invalid OpenAI API key. Please check your configuration.';
        } else if (error.status === 429) {
            errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
        } else if (error.status === 402) {
            errorMessage = 'OpenAI credits exhausted. Please add more credits to your account.';
        }
        
        // Log error
        if (req.body.userId && req.body.scriptData) {
            await logRequest(req.body.userId, 'gpt4_analysis', req.body.scriptData.name, 'error');
        }
        
        res.status(500).json({
            success: false,
            error: errorMessage,
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Parse GPT's response into structured components
function parseGPTResponse(gptText, originalCode) {
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
            analysis: /\*\*ANALYSIS\*\*:\s*([\s\S]*?)(?=\*\*|$)/i,
            code: /\*\*IMPROVED CODE\*\*:\s*```lua([\s\S]*?)```/i,
            explanation: /\*\*EXPLANATION\*\*:\s*([\s\S]*?)(?=\*\*|$)/i,
            recommendations: /\*\*RECOMMENDATIONS\*\*:\s*([\s\S]*?)(?=\*\*|$)/i,
            performance: /\*\*PERFORMANCE NOTES\*\*:\s*([\s\S]*?)(?=\*\*|$)/i
        };
        
        // Extract each section
        for (const [key, regex] of Object.entries(sections)) {
            const match = gptText.match(regex);
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
            response.analysis = gptText;
        }
        
    } catch (error) {
        console.error('Error parsing GPT response:', error);
        response.analysis = gptText;
    }
    
    return response;
}

// Legacy endpoint for backward compatibility
app.post('/api/ai-help', async (req, res) => {
    // Redirect to new GPT-4 endpoint with adapted format
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
    
    // Forward to GPT-4 analysis
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
    console.log(`🤖 Powered by GPT-4 (FREE $5 Credits!)`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔧 Analysis endpoint: http://localhost:${PORT}/api/claude-analysis`);
    console.log(`💾 Database: ${supabase ? 'Connected' : 'Disabled (dev mode)'}`);
    console.log(`💰 OpenAI Free Credits: Get yours at https://platform.openai.com/api-keys`);
    
    if (!OPENAI_API_KEY) {
        console.warn('⚠️  Warning: OPENAI_API_KEY not configured');
        console.log('🔗 Get free $5 credits: https://platform.openai.com/api-keys');
    }
});