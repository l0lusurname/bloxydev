const express = require('express');
const router = express.Router();
const { validateAIRequest } = require('../middleware/validation');
const { generateCode } = require('../controllers/aiController');
const authenticate = require('../middleware/auth');

// Generate Lua code based on prompt and game tree
router.post('/generate', authenticate, validateAIRequest, generateCode);

module.exports = router;