const { parseGameTree } = require('../services/gameTreeService');
const logger = require('../utils/logger');

const processGameTree = async (req, res, next) => {
    try {
        const { gameTree } = req.body;
        
        // Process and analyze the game tree
        const processedTree = await parseGameTree(gameTree);
        
        res.json({
            success: true,
            data: processedTree
        });
    } catch (error) {
        logger.error('Error processing game tree:', error);
        next(error);
    }
};

module.exports = {
    processGameTree
};