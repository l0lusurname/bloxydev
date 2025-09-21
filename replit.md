# Roblox AI Assistant Plugin Backend

## Overview
This is a Node.js/Express backend API for a Roblox Studio AI Assistant plugin that generates and fixes Roblox Lua code using AI. The API provides endpoints for AI code generation, game tree processing, and placeholder functionality for credits and checkpoints.

## Project Architecture
- **Main Server**: `src/server.js` - Express server configured for Replit environment
- **Controllers**: Handle request processing and response formatting
- **Services**: AI integration with DeepSeek API for code generation
- **Middleware**: Authentication, validation, error handling
- **Routes**: API endpoints for different functionalities

## Current Configuration
- **Port**: 3000 (backend API server)
- **Host**: 0.0.0.0 (configured for Replit environment)
- **Trust Proxy**: Enabled for Replit's proxy infrastructure
- **CORS**: Configured to allow all origins for development

## API Endpoints
- `GET /health` - Health check endpoint
- `GET /api/test` - API status and endpoint information
- `POST /api/ai/generate` - AI code generation (requires authentication)
- `POST /api/game-tree/process` - Game tree processing
- `GET /api/credits/balance` - Credit balance (placeholder)
- `POST /api/credits/add` - Add credits (placeholder)
- `POST /api/checkpoint/save` - Save checkpoint (placeholder)
- `POST /api/checkpoint/restore` - Restore checkpoint (placeholder)

## Required Secrets
The following secrets need to be configured in Replit:
- `DEEPSEEK_API_KEY` - API key for DeepSeek AI service
- `AI_GATEWAY_KEY` - Authentication key for API access

## Dependencies
- Express.js for web framework
- DeepSeek API for AI code generation
- Winston for logging
- Joi for request validation
- Helmet for security headers
- CORS for cross-origin requests
- Express rate limiting

## Recent Changes
- September 21, 2025: Initial Replit environment setup
  - Configured server to run on port 3000 with 0.0.0.0 host binding
  - Enabled proxy trust for Replit infrastructure
  - Set up workflow for backend API server
  - Verified all API endpoints are functional

## Current Status
✅ Backend API server is running and functional
✅ All endpoints responding correctly
✅ Environment configured for Replit
⚠️ Database integration not implemented (MongoDB/Mongoose listed as dependency but not used)
⚠️ AI functionality requires API keys to be configured
⚠️ Credit and checkpoint systems are placeholder implementations