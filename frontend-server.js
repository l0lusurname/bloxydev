const express = require('express');
const path = require('path');

const app = express();
const port = 5000;

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Handle client-side routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Frontend server running on http://0.0.0.0:${port}`);
});