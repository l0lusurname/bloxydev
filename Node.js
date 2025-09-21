// Railway-Optimized AI Dev Assistant Backend with GPT-4
// server.js - NO DATABASE DEPENDENCIES

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Validate required environment variables
if (!OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY is required');
    console.error('🔗 Set it in Railway environment variables');
    // Don't exit in production, just warn
    console.warn('⚠️  Running without OpenAI API key - mock responses only');
}

// Initialize OpenAI client
const openai = OPENAI_API_KEY ? new OpenAI({
    apiKey: OPENAI_API_KEY,
}) : null;

// Middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:3000', 'https://www.roblox.com', 'roblox-studio://', '*'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting - adjusted for Railway
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // More generous for production
    message: {
        success: false,
        error: 'Too many requests. Please wait before trying again.',
        retryAfter: '15 minutes'
    }
});
app.use('/api', limiter);

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    console.log(`${timestamp} - ${req.method} ${req.path} - IP: ${ip.slice(-10)}`);
    next();
});

// In-memory storage for development (no database needed)
const requestLogs = [];
const userStats = new Map();

// Utility Functions
function sanitizeLuaCode(code) {
    if (!code) return '';
    return code
        .replace(/--\[\[[\s\S]*?\]\]/g, '') // Remove block comments
        .replace(/--[^\r\n]*/g, '') // Remove line comments
        .trim();
}

function analyzeLuaScript(scriptData, gameContext = {}) {
    const analysis = {
        complexity: 'medium',
        patterns: [],
        issues: [],
        suggestions: [],
        security: []
    };
    
    if (!scriptData || !scriptData.source) return analysis;
    
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
    const { scriptData, gameContext = {}, relatedScripts = [], relevantAssets = [] } = requestData;
    
    let prompt = `You are an expert Roblox Lua developer. Analyze and improve this script.

TARGET SCRIPT:
Name: ${scriptData.name || 'Unknown'}
Type: ${scriptData.className || 'Script'}
Location: ${scriptData.path || 'Unknown'}

SCRIPT CODE:
\`\`\`lua
${scriptData.source || '-- No source code provided'}
\`\`\``;

    if (gameContext.totalObjects > 0) {
        prompt += `\n\nGAME CONTEXT:
- Total Objects: ${gameContext.totalObjects}
- Total Scripts: ${gameContext.scriptCount}
- Services: ${Object.keys(gameContext.services || {}).join(', ')}`;
    }

    if (relatedScripts.length > 0) {
        prompt += `\n\nRELATED SCRIPTS: ${relatedScripts.slice(0, 3).map(s => s.name).join(', ')}`;
    }

    prompt += `\n\nProvide your response in this format:

**ANALYSIS**:
[Brief analysis of the script's purpose and current state]

**IMPROVED CODE**:
\`\`\`lua
[Optimized Lua code using modern Roblox practices]
\`\`\`

**EXPLANATION**:
[Key improvements made]

**RECOMMENDATIONS**:
[Suggestions for further improvement]

**PERFORMANCE NOTES**:
[Performance considerations]

Focus on modern Roblox Lua practices (task.wait, proper error handling, service usage).`;

    return prompt;
}

function logRequest(userId, requestType, scriptName, status, tokensUsed = 0) {
    const logEntry = {
        userId,
        requestType,
        scriptName,
        status,
        tokensUsed,
        timestamp: new Date().toISOString()
    };
    
    requestLogs.push(logEntry);
    
    // Keep only last 1000 logs in memory
    if (requestLogs.length > 1000) {
        requestLogs.shift();
    }
    
    console.log(`📊 ${userId} - ${requestType} - ${scriptName} - ${status} - ${tokensUsed} tokens`);
}

// Mock responses for when OpenAI is not available
const getMockResponse = (scriptData) => {
    const mockResponses = [
        {
            analysis: "This script appears to be a basic Roblox script that could benefit from modern practices.",
            improvedCode: `-- Improved ${scriptData.name || 'Script'}
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

-- Modern Roblox practices applied
local player = Players.LocalPlayer

-- Use task.wait instead of wait
task.wait(1)

print("Hello from improved script!")`,
            explanation: "Applied modern Roblox Lua practices including proper service usage and task.wait instead of deprecated wait().",
            recommendations: "Consider using proper event connections and error handling for production code.",
            performanceNotes: "Script has been optimized for better performance and maintainability."
        },
        {
            analysis: "Script shows good structure but could benefit from error handling and modern API usage.",
            improvedCode: `-- Refactored ${scriptData.name || 'Script'}
-- Better error handling and structure

local success, result = pcall(function()
    -- Your improved code here
    ${scriptData.source ? scriptData.source.split('\n').slice(0, 10).join('\n    ') : 'print("Hello World")'}
end)

if not success then
    warn("Script error:", result)
end`,
            explanation: "Added proper error handling with pcall and improved code structure.",
            recommendations: "Consider implementing proper logging and event cleanup for production use.",
            performanceNotes: "Error handling prevents crashes and improves reliability."
        }
    ];
    
    return mockResponses[Math.floor(Math.random() * mockResponses.length)];
};

// Parse GPT response
function parseGPTResponse(gptText, originalCode) {
    const response = {
        analysis: '',
        improvedCode: originalCode,
        explanation: '',
        recommendations: '',
        performanceNotes: ''
    };
    
    try {
        const sections = {
            analysis: /\*\*ANALYSIS\*\*:\s*([\s\S]*?)(?=\*\*|$)/i,
            code: /\*\*IMPROVED CODE\*\*:\s*```lua([\s\S]*?)```/i,
            explanation: /\*\*EXPLANATION\*\*:\s*([\s\S]*?)(?=\*\*|$)/i,
            recommendations: /\*\*RECOMMENDATIONS\*\*:\s*([\s\S]*?)(?=\*\*|$)/i,
            performance: /\*\*PERFORMANCE NOTES\*\*:\s*([\s\S]*?)(?=\*\*|$)/i
        };
        
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
        
        if (!response.analysis && !response.explanation) {
            response.analysis = gptText;
        }
        
    } catch (error) {
        console.error('Error parsing GPT response:', error);
        response.analysis = gptText;
    }
    
    return response;
}

// Routes

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Roblox AI Dev Assistant',
        version: '2.0.0-railway',
        ai: openai ? 'GPT-4 Connected' : 'Mock Responses',
        timestamp: new Date().toISOString(),
        endpoints: [
            'GET /health - Health check',
            'POST /api/claude-analysis - Script analysis',
            'GET /api/stats - Usage statistics'
        ]
    });
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0-railway',
        ai: openai ? 'GPT-4 Connected' : 'Mock Mode',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        requests: requestLogs.length
    });
});

// Main analysis endpoint
app.post('/api/claude-analysis', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { userId, scriptData, gameContext, relatedScripts, relevantAssets } = req.body;
        
        // Validate request
        if (!userId || !scriptData) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId and scriptData'
            });
        }
        
        console.log(`🤖 Analysis request for user ${userId}, script: ${scriptData.name || 'Unknown'}`);
        
        logRequest(userId, 'analysis', scriptData.name || 'Unknown', 'processing');
        
        let responseData;
        let tokensUsed = 0;
        
        if (openai && scriptData.source) {
            // Use real GPT-4
            try {
                const prompt = buildGPTPrompt(req.body);
                
                const completion = await openai.chat.completions.create({
                    model: "gpt-4",
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert Roblox Lua developer. Provide structured, helpful analysis."
                        },
                        {
                            role: "user",
                            content: prompt
                        }
                    ],
                    max_tokens: 3000,
                    temperature: 0.1
                });
                
                tokensUsed = completion.usage.total_tokens;
                responseData = parseGPTResponse(completion.choices[0].message.content, scriptData.source);
                
                console.log(`✅ GPT-4 analysis completed (${tokensUsed} tokens)`);
                
            } catch (gptError) {
                console.error('GPT-4 error:', gptError.message);
                responseData = getMockResponse(scriptData);
                responseData.analysis += "\n\n⚠️ Note: Using fallback analysis due to API error.";
            }
        } else {
            // Use mock response
            responseData = getMockResponse(scriptData);
            responseData.analysis += "\n\n💡 Note: This is a demo response. Connect OpenAI API for full analysis.";
        }
        
        // Analyze script
        const scriptAnalysis = analyzeLuaScript(scriptData, gameContext);
        
        logRequest(userId, 'analysis', scriptData.name || 'Unknown', 'completed', tokensUsed);
        
        const processingTime = Date.now() - startTime;
        
        res.json({
            success: true,
            ...responseData,
            tokensUsed: tokensUsed,
            creditsUsed: Math.ceil(tokensUsed / 1000),
            processingTimeMs: processingTime,
            scriptAnalysis: scriptAnalysis,
            aiModel: openai ? 'GPT-4' : 'Mock',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Analysis error:', error);
        
        if (req.body.userId && req.body.scriptData) {
            logRequest(req.body.userId, 'analysis', req.body.scriptData.name || 'Unknown', 'error');
        }
        
        res.status(500).json({
            success: false,
            error: 'Analysis failed. Please try again.',
            timestamp: new Date().toISOString()
        });
    }
});

// Usage statistics
app.get('/api/stats', (req, res) => {
    const stats = {
        totalRequests: requestLogs.length,
        successfulRequests: requestLogs.filter(log => log.status === 'completed').length,
        errorRequests: requestLogs.filter(log => log.status === 'error').length,
        totalTokens: requestLogs.reduce((sum, log) => sum + (log.tokensUsed || 0), 0),
        uptime: process.uptime(),
        lastHour: requestLogs.filter(log => 
            new Date(log.timestamp) > new Date(Date.now() - 3600000)
        ).length
    };
    
    res.json({
        success: true,
        stats: stats,
        timestamp: new Date().toISOString()
    });
});

// Legacy compatibility endpoint
app.post('/api/ai-help', (req, res) => {
    const adaptedRequest = {
        userId: req.body.userId || 'unknown',
        scriptData: {
            name: req.body.scriptName || 'Unknown',
            className: req.body.scriptType || 'Script',
            source: req.body.scriptContent || '',
            path: req.body.scriptName || 'Unknown'
        },
        gameContext: { totalObjects: 0, scriptCount: 1, services: {} }
    };
    
    req.body = adaptedRequest;
    return app.handle(Object.assign(req, { path: '/api/claude-analysis', method: 'POST' }), res);
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: ['/health', '/api/claude-analysis', '/api/stats'],
        timestamp: new Date().toISOString()
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Roblox AI Dev Assistant running on port ${PORT}`);
    console.log(`🤖 AI: ${openai ? 'GPT-4 Connected' : 'Mock Mode'}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`⚡ Railway deployment ready!`);
    
    if (!OPENAI_API_KEY) {
        console.log(`🔑 Add OPENAI_API_KEY environment variable for full functionality`);
    }
});