const express = require('express');
const mineflayer = require('mineflayer');
const { Authflow, Titles } = require('prismarine-auth');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Store active bots in memory
const activeBots = new Map();
const accounts = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Get all accounts
app.get('/api/accounts', (req, res) => {
  const accountList = Array.from(accounts.values()).map(acc => ({
    id: acc.id,
    username: acc.username,
    email: acc.email,
    status: activeBots.has(acc.id) ? 'online' : 'offline',
    server: acc.server || 'Not connected'
  }));
  res.json(accountList);
});

// Add new account with Microsoft login
app.post('/api/accounts/add', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const accountId = Date.now().toString();
    
    // Initialize Microsoft authentication with better settings for cloud hosting
    const authflow = new Authflow(email, './auth_cache', {
      authTitle: Titles.MinecraftJava,
      deviceType: 'Win32',
      flow: 'live',
      relyingParty: 'https://multiplayer.minecraft.net/',
    });

    // This will prompt for Microsoft login
    console.log(`Starting Microsoft authentication for ${email}...`);
    
    const account = {
      id: accountId,
      email: email,
      authflow: authflow,
      username: email.split('@')[0],
      addedAt: new Date().toISOString()
    };

    accounts.set(accountId, account);

    res.json({ 
      success: true, 
      accountId: accountId,
      message: 'Account added. Please check console for Microsoft login link.'
    });

  } catch (error) {
    console.error('Error adding account:', error);
    res.status(500).json({ error: error.message });
  }
});

// Connect bot to server
app.post('/api/bots/connect', async (req, res) => {
  try {
    const { accountId, serverIp } = req.body;

    if (!accountId || !serverIp) {
      return res.status(400).json({ error: 'Account ID and server IP are required' });
    }

    const account = accounts.get(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (activeBots.has(accountId)) {
      return res.status(400).json({ error: 'Bot already connected' });
    }

    // Parse server IP and port
    const [host, port] = serverIp.includes(':') 
      ? serverIp.split(':') 
      : [serverIp, '25565'];

    console.log(`Connecting ${account.username} to ${host}:${port}...`);

    // Get Microsoft auth token
    const token = await account.authflow.getMinecraftJavaToken();

    // Create bot with Microsoft authentication
    const bot = mineflayer.createBot({
      host: host,
      port: parseInt(port),
      username: token.profile.name,
      auth: 'microsoft',
      session: {
        accessToken: token.token,
        clientToken: token.profile.id,
        selectedProfile: {
          id: token.profile.id,
          name: token.profile.name
        }
      },
      version: false, // Auto-detect version
      checkTimeoutInterval: 60000
    });

    // Bot event handlers
    bot.on('login', () => {
      console.log(`✅ ${bot.username} logged in to ${host}:${port}`);
      account.username = bot.username;
    });

    bot.on('spawn', () => {
      console.log(`🎮 ${bot.username} spawned in the world`);
    });

    bot.on('error', (err) => {
      console.error(`❌ Bot error for ${account.username}:`, err.message);
    });

    bot.on('kicked', (reason) => {
      console.log(`⚠️ ${bot.username} was kicked: ${reason}`);
      activeBots.delete(accountId);
    });

    bot.on('end', () => {
      console.log(`🔴 ${bot.username} disconnected`);
      activeBots.delete(accountId);
    });

    // Auto-reconnect on death
    bot.on('death', () => {
      console.log(`💀 ${bot.username} died, respawning...`);
      setTimeout(() => {
        bot.chat('/respawn');
      }, 2000);
    });

    activeBots.set(accountId, bot);
    account.server = serverIp;

    res.json({ 
      success: true, 
      message: `Connecting ${account.username} to ${serverIp}...` 
    });

  } catch (error) {
    console.error('Error connecting bot:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect bot
app.post('/api/bots/disconnect', (req, res) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const bot = activeBots.get(accountId);
    if (!bot) {
      return res.status(400).json({ error: 'Bot not connected' });
    }

    bot.end();
    activeBots.delete(accountId);

    res.json({ success: true, message: 'Bot disconnected' });

  } catch (error) {
    console.error('Error disconnecting bot:', error);
    res.status(500).json({ error: error.message });
  }
});

// Remove account
app.delete('/api/accounts/:accountId', (req, res) => {
  try {
    const { accountId } = req.params;

    // Disconnect bot if connected
    const bot = activeBots.get(accountId);
    if (bot) {
      bot.end();
      activeBots.delete(accountId);
    }

    accounts.delete(accountId);

    res.json({ success: true, message: 'Account removed' });

  } catch (error) {
    console.error('Error removing account:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    accounts: accounts.size,
    activeBots: activeBots.size
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Minecraft Bot Manager running on port ${PORT}`);
  console.log(`📱 Open http://localhost:${PORT} in your browser`);
});