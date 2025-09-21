require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Import routes
const gameTreeRoutes = require('./routes/gameTree');
const aiRoutes = require('./routes/ai');
const checkpointRoutes = require('./routes/checkpoint');
const creditRoutes = require('./routes/credits');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
// Configure CORS to accept requests from Roblox Studio
app.use(cors({
    origin: '*', // Allow all origins for development
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' })); // Increased limit for game tree data

// Add request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`);
    next();
});

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Routes
app.use('/api/game-tree', gameTreeRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/checkpoint', checkpointRoutes);
app.use('/api/credits', creditRoutes);

// Error handling
app.use(errorHandler);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start server
const server = app.listen(port)
    .on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            logger.warn(`Port ${port} is busy, trying ${port + 1}...`);
            server.listen(port + 1);
        } else {
            logger.error('Server error:', err);
            process.exit(1);
        }
    })
    .on('listening', () => {
        const address = server.address();
        logger.info(`Server is running on port ${address.port}`);
    });