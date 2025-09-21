const express = require('express');
const router = express.Router();
const { validateAIRequest } = require('../middleware/validation');
const { generateCode } = require('../controllers/aiController');

// Generate Lua code based on prompt and game tree
router.post('/generate', validateAIRequest, generateCode);

module.exports = router;