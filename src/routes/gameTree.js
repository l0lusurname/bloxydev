const express = require('express');
const router = express.Router();
const { validateGameTree } = require('../middleware/validation');
const { processGameTree } = require('../controllers/gameTreeController');

// Process game tree data
router.post('/process', validateGameTree, processGameTree);

module.exports = router;