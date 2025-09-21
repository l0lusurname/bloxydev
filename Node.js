// AI Dev Assistant Backend Server
// Run with: node server.js

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

// Environment variables (create a .env file)
const SUPABASE_URL = process.env.SUPABASE_URL || 'your_supabase_url';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your_supabase_key';
const AI_API_KEY = process.env.AI_API_KEY || 'your_ai_api_key';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Middleware
app.use(helmet());
app.use(cors({
    origin: ['http://localhost:3000', 'https://www.roblox.com'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Mock AI responses for MVP testing
const mockAIResponses = [
    {
        type: 'refactor',
        response: `-- AI Refactored Script
-- Improved version with better practices

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

-- Constants
local WALK_SPEED = 16
local JUMP_POWER = 50

-- Variables
local player = Players.LocalPlayer
local character = player.Character or player.CharacterAdded:Wait()
local humanoid = character:WaitForChild("Humanoid")

-- Functions
local function initializeCharacter()
    if humanoid then
        humanoid.WalkSpeed = WALK_SPEED
        humanoid.JumpPower = JUMP_POWER
    end
end

-- Events
player.CharacterAdded:Connect(function(newCharacter)
    character = newCharacter
    humanoid = character:WaitForChild("Humanoid")
    initializeCharacter()
end)

-- Initialize
initializeCharacter()

print("Character setup complete!")`
    },
    {
        type: 'fix',
        response: `-- AI Fixed Script
-- Corrected syntax and logical errors

local function calculateDistance(pos1, pos2)
    -- Fixed: Added proper error checking
    if not pos1 or not pos2 then
        warn("Invalid positions provided to calculateDistance")
        return 0
    end
    
    return (pos1 - pos2).Magnitude
end

-- Fixed: Proper event connection
game.Players.PlayerAdded:Connect(function(player)
    player.CharacterAdded:Connect(function(character)
        local humanoid = character:WaitForChild("Humanoid")
        -- Fixed: Added error checking
        if humanoid then
            print(player.Name .. " has spawned!")
        end
    end)
end)`
    },
    {
        type: 'optimize',
        response: `-- AI Optimized Script
-- Performance improvements and best practices

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

-- Cache frequently used objects
local remoteEvents = ReplicatedStorage:WaitForChild("RemoteEvents")
local dataUpdateEvent = remoteEvents:WaitForChild("DataUpdate")

-- Optimized: Use object pooling for frequent operations
local objectPool = {}

local function getFromPool()
    return table.remove(objectPool) or Instance.new("Part")
end

local function returnToPool(object)
    object.Parent = nil
    table.insert(objectPool, object)
end

-- Optimized: Batch operations instead of individual calls
local updateQueue = {}
local lastUpdate = tick()

local function processUpdateQueue()
    if #updateQueue > 0 and tick() - lastUpdate > 0.1 then
        dataUpdateEvent:FireServer(updateQueue)
        updateQueue = {}
        lastUpdate = tick()
    end
end

-- Connection
game:GetService("RunService").Heartbeat:Connect(processUpdateQueue)`
    }
];

// Database functions
async function getUserCredits(userId) {
    try {
        const { data, error } = await supabase
            .from('user_credits')
            .select('credits')
            .eq('user_id', userId)
            .single();
        
        if (error) {
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
    try {
        const { data, error } = await supabase
            .from('user_credits')
            .update({ 
                credits: supabase.raw('credits - ?', [amount]),
                last_used: new Date().toISOString()
            })
            .eq('user_id', userId)
            .select();
        
        if (error) {
            console.error('Error deducting credits:', error);
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Database error:', error);
        return false;
    }
}

async function logRequest(userId, requestType, scriptName, status) {
    try {
        const { error } = await supabase
            .from('request_logs')
            .insert([
                {
                    user_id: userId,
                    request_type: requestType,
                    script_name: scriptName,
                    status: status,
                    timestamp: new Date().toISOString()
                }
            ]);
        
        if (error) {
            console.error('Error logging request:', error);
        }
    } catch (error) {
        console.error('Database error:', error);
    }
}

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Get user credits
app.get('/api/credits/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const credits = await getUserCredits(userId);
        
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

// Main AI help endpoint
app.post('/api/ai-help', async (req, res) => {
    try {
        const { userId, scriptName, scriptType, scriptContent, timestamp } = req.body;
        
        // Validate request
        if (!userId || !scriptName || !scriptContent) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }
        
        // Check user credits (skip for MVP testing)
        const credits = await getUserCredits(userId);
        console.log(`User ${userId} has ${credits} credits`);
        
        // For MVP: Skip credit deduction, just log the request
        await logRequest(userId, 'ai_help', scriptName, 'processing');
        
        // Simulate AI processing delay
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Return mock AI response
        const randomResponse = mockAIResponses[Math.floor(Math.random() * mockAIResponses.length)];
        
        // Log successful completion
        await logRequest(userId, 'ai_help', scriptName, 'completed');
        
        res.json({
            success: true,
            improvedCode: randomResponse.response,
            explanation: `Applied ${randomResponse.type} improvements to your script. Key changes include better error handling, performance optimizations, and code structure improvements.`,
            creditsUsed: 1,
            creditsRemaining: credits - 1
        });
        
    } catch (error) {
        console.error('Error processing AI request:', error);
        
        // Log error
        if (req.body.userId && req.body.scriptName) {
            await logRequest(req.body.userId, 'ai_help', req.body.scriptName, 'error');
        }
        
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Purchase credits endpoint
app.post('/api/purchase-credits', async (req, res) => {
    try {
        const { userId, productId, receiptId, creditsToAdd } = req.body;
        
        // Validate Roblox purchase receipt (simplified for MVP)
        // In production, verify with Roblox API
        
        // Add credits to user account
        const { error } = await supabase
            .from('user_credits')
            .upsert([
                {
                    user_id: userId,
                    credits: supabase.raw('COALESCE(credits, 0) + ?', [creditsToAdd]),
                    last_purchase: new Date().toISOString()
                }
            ]);
        
        if (error) {
            throw error;
        }
        
        // Log purchase
        await supabase
            .from('purchase_logs')
            .insert([
                {
                    user_id: userId,
                    product_id: productId,
                    receipt_id: receiptId,
                    credits_added: creditsToAdd,
                    timestamp: new Date().toISOString()
                }
            ]);
        
        res.json({
            success: true,
            message: `Successfully added ${creditsToAdd} credits`,
            newBalance: await getUserCredits(userId)
        });
        
    } catch (error) {
        console.error('Error processing purchase:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to process purchase'
        });
    }
});

// Get usage statistics
app.get('/api/stats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const { data: logs } = await supabase
            .from('request_logs')
            .select('*')
            .eq('user_id', userId)
            .order('timestamp', { ascending: false })
            .limit(50);
        
        const totalRequests = logs?.length || 0;
        const successfulRequests = logs?.filter(log => log.status === 'completed').length || 0;
        
        res.json({
            success: true,
            stats: {
                totalRequests,
                successfulRequests,
                recentLogs: logs?.slice(0, 10) || []
            }
        });
        
    } catch (error) {
        console.error('Error getting stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve statistics'
        });
    }
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
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔧 API endpoint: http://localhost:${PORT}/api/ai-help`);
});