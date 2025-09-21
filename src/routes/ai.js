const express = require('express');
const router = express.Router();
const { validateAIRequest } = require('../middleware/validation');
const { generateCode, handleChat } = require('../controllers/aiController');
const authenticate = require('../middleware/auth');

// Generate Lua code based on prompt and game tree
router.post('/generate', authenticate, validateAIRequest, generateCode);

// Public generate endpoint for plugin use (no authentication required)
router.post('/generate-public', validateAIRequest, generateCode);

// Chat endpoint for user-friendly AI responses
router.post('/chat', handleChat);

module.exports = router;