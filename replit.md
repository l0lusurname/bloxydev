# Roblox AI Assistant with Chat Interface

## Overview
This is a full-stack Node.js application for a Roblox Studio AI Assistant with a dark-themed chat interface. It includes both a backend API and a frontend web interface that allows users to interact with AI through natural conversations.

## Project Architecture
### Backend (Port 3000)
- **Main Server**: `src/server.js` - Express server configured for Replit environment
- **Controllers**: Handle request processing and response formatting
- **Services**: AI integration with OpenRouter API for code generation and chat
- **Middleware**: Authentication, validation, error handling
- **Routes**: API endpoints for different functionalities

### Frontend (Port 5000)
- **Interface**: Dark-themed chat application with messaging layout
- **Chat UI**: User messages on right (dark), AI responses on left (white)
- **Static Server**: `frontend-server.js` - Serves the web interface
- **Client**: Real-time chat with AI assistant

## Current Configuration
- **Backend Port**: 3000 (API server)
- **Frontend Port**: 5000 (web interface)
- **Host**: 0.0.0.0 (configured for Replit environment)
- **Trust Proxy**: Enabled for Replit's proxy infrastructure
- **CORS**: Configured to allow all origins for development

## API Endpoints
- `GET /health` - Health check endpoint
- `GET /api/test` - API status and endpoint information
- `POST /api/ai/chat` - Chat interface with user-friendly AI responses
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
- September 21, 2025: Initial Replit environment setup and chat interface implementation
  - Configured backend server to run on port 3000 with 0.0.0.0 host binding
  - Created dark-themed frontend chat interface on port 5000
  - Implemented chat API with user-friendly AI responses
  - Added AI capabilities for reading system logs
  - Built property management infrastructure (create, edit, delete operations)
  - Set up dual workflow system (Backend API Server + Frontend)
  - Enabled proxy trust for Replit infrastructure
  - Verified all endpoints functional and chat interface working

## AI Features
- **Chat Interface**: Natural language conversations with AI assistant
- **Log Reading**: AI can read and analyze system logs
- **Property Management**: Infrastructure for create, edit, delete operations
- **Code Generation**: AI-powered Roblox Lua script generation
- **User-Friendly Responses**: AI provides friendly responses without showing technical details

## Current Status
✅ Backend API server running on port 3000 - functional
✅ Frontend chat interface running on port 5000 - functional  
✅ Dark themed UI with proper message layout implemented
✅ Chat API endpoint working with user-friendly responses
✅ AI log reading capabilities implemented
✅ Property management infrastructure in place
✅ Environment configured for Replit
⚠️ Database integration not implemented (MongoDB/Mongoose listed as dependency but not used)
⚠️ AI functionality requires API keys to be configured for full code generation
⚠️ Credit and checkpoint systems are placeholder implementations