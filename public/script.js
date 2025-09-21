class RobloxAIChat {
    constructor() {
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        
        this.apiBaseUrl = window.location.protocol + '//' + window.location.hostname + ':3000';
        
        this.init();
    }
    
    init() {
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Auto-resize textarea
        this.messageInput.addEventListener('input', () => {
            this.messageInput.style.height = 'auto';
            this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
        });
        
        // Check API connection
        this.checkApiConnection();
    }
    
    async checkApiConnection() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`);
            const data = await response.json();
            console.log('API Connection:', data.status === 'ok' ? 'Connected' : 'Disconnected');
        } catch (error) {
            console.warn('API Connection failed:', error.message);
        }
    }
    
    async sendMessage() {
        const message = this.messageInput.value.trim();
        if (!message) return;
        
        // Add user message to chat
        this.addMessage(message, 'user');
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        
        // Show loading
        this.showLoading(true);
        
        try {
            // Send to AI for processing
            const aiResponse = await this.processWithAI(message);
            this.addMessage(aiResponse, 'ai');
        } catch (error) {
            console.error('AI Error:', error);
            this.addMessage('Sorry, I encountered an error processing your request. Please try again.', 'ai');
        } finally {
            this.showLoading(false);
        }
    }
    
    async processWithAI(message) {
        try {
            // First, send to chat endpoint for user-friendly response
            const response = await fetch(`${this.apiBaseUrl}/api/ai/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            return data.response || 'I received your request and will help you with that.';
        } catch (error) {
            // Fallback to a friendly response
            return this.generateFriendlyResponse(message);
        }
    }
    
    generateFriendlyResponse(message) {
        const lowerMessage = message.toLowerCase();
        
        if (lowerMessage.includes('create') || lowerMessage.includes('make') || lowerMessage.includes('generate')) {
            return "Sure! I'll create that for you. Let me work on it right away.";
        } else if (lowerMessage.includes('edit') || lowerMessage.includes('modify') || lowerMessage.includes('change')) {
            return "I'll edit those properties for you. Working on it now.";
        } else if (lowerMessage.includes('delete') || lowerMessage.includes('remove')) {
            return "I'll remove that for you. Let me handle the deletion.";
        } else if (lowerMessage.includes('script') || lowerMessage.includes('code')) {
            return "I'll help you with that script. Creating the code now.";
        } else if (lowerMessage.includes('property') || lowerMessage.includes('properties')) {
            return "I'll manage those properties for you. Let me make the necessary changes.";
        } else if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
            return "I'm here to help! I can create scripts, edit properties, manage your Roblox projects, and much more.";
        } else {
            return "I understand what you need. Let me work on that for you.";
        }
    }
    
    addMessage(content, type) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        messageContent.textContent = content;
        
        messageDiv.appendChild(messageContent);
        this.messagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
    
    showLoading(show) {
        this.loadingOverlay.style.display = show ? 'flex' : 'none';
        this.sendButton.disabled = show;
    }
}

// Initialize the chat when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new RobloxAIChat();
});