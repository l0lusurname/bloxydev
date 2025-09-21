// Minimal AI Dev Assistant Backend
const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        ai: 'GPT-4',
        timestamp: new Date().toISOString()
    });
});

// Simple analysis endpoint
app.post('/api/claude-analysis', async (req, res) => {
    try {
        const { scriptData } = req.body;
        
        if (!scriptData || !scriptData.source) {
            return res.status(400).json({
                success: false,
                error: 'Missing script data'
            });
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{
                role: "user",
                content: `Analyze and improve this Roblox Lua script:\n\n${scriptData.source}`
            }],
            max_tokens: 2000
        });

        res.json({
            success: true,
            analysis: "GPT-4 analysis completed!",
            improvedCode: completion.choices[0].message.content,
            explanation: "Code has been analyzed and optimized.",
            recommendations: "Follow modern Roblox Lua practices.",
            performanceNotes: "Consider performance optimizations."
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({
            success: false,
            error: 'Analysis failed'
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🤖 GPT-4 backend ready!`);
});