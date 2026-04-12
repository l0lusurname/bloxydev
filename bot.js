// Bulletproof 24/7 AFK bot for DonutSMP (or any Minecraft server)
// ⚠️ Use only your own account and follow server rules.
const mineflayer = require('mineflayer')

const HOST = process.env.MC_HOST || 'donutsmp.net'
const PORT = parseInt(process.env.MC_PORT || '25565')
const USERNAME = process.env.MC_USERNAME
const PASSWORD = process.env.MC_PASSWORD
const AUTH = process.env.MC_AUTH || 'microsoft'
const VERSION = process.env.MC_VERSION || '1.21.9' // Default to stable version

if (!USERNAME) {
  console.error('❌ Missing MC_USERNAME environment variable')
  process.exit(1)
} 

let reconnectAttempts = 0
let reconnectTimeout = null
let teamHomeInterval = null
let bot = null

// Helper function to parse kick/disconnect messages
function parseMinecraftMessage(msg) {
  if (typeof msg === 'string') return msg
  
  if (typeof msg === 'object') {
    let text = ''
    
    // Handle NBT format
    if (msg.type === 'compound' && msg.value) {
      return parseMinecraftMessage(msg.value)
    }
    
    // Get base text
    if (msg.text) {
      if (typeof msg.text === 'string') {
        text += msg.text
      } else if (msg.text.value) {
        text += msg.text.value
      }
    }
    
    // Parse extra components
    if (msg.extra) {
      const extras = msg.extra.value || msg.extra
      if (Array.isArray(extras)) {
        extras.forEach(part => {
          text += parseMinecraftMessage(part)
        })
      }
    }
    
    // Try to get JSON string representation
    if (!text && msg.toString) {
      try {
        const str = msg.toString()
        if (str !== '[object Object]') {
          text = str
        }
      } catch (e) {}
    }
    
    return text || JSON.stringify(msg, null, 2)
  }
  
  return String(msg)
}

function clearIntervals() {
  if (teamHomeInterval) {
    clearInterval(teamHomeInterval)
    teamHomeInterval = null
  }
}

function startBot() {
  // Clear any existing reconnect timeout
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  // Clear any existing intervals
  clearIntervals()

  const botOptions = {
    host: HOST,
    port: PORT,
    username: USERNAME,
    auth: AUTH,
    version: VERSION,
    connectTimeout: 60000,
    checkTimeoutInterval: 30000,
    hideErrors: false,
    keepAlive: true,
    validateChannelProtocol: false
  }

  if (PASSWORD) {
    botOptions.password = PASSWORD
  }

  try {
    bot = mineflayer.createBot(botOptions)
  } catch (err) {
    console.error('❌ Failed to create bot:', err.message)
    scheduleReconnect()
    return
  }

  bot.once('login', () => {
    console.log(`✅ Logged in as ${USERNAME}`)
    console.log(`📦 Protocol version: ${bot.version}`)
    reconnectAttempts = 0
  })

  bot.once('spawn', () => {
    console.log('🌍 Spawned and ready!')
    
    // Execute /team home immediately on spawn
    setTimeout(() => {
      if (bot && bot.entity) {
        console.log('🏠 Executing /team home...')
        bot.chat('/team home')
      }
    }, 2000)

    // Execute /team home every 10 minutes
    teamHomeInterval = setInterval(() => {
      if (bot && bot.entity) {
        console.log('🏠 Executing /team home (scheduled)...')
        bot.chat('/team home')
      }
    }, 1000 * 60 * 10)
  })

  bot.on('end', (reason) => {
    const parsedReason = parseMinecraftMessage(reason)
    console.log('⚠️ Disconnected:', parsedReason)
    clearIntervals()
    scheduleReconnect()
  })

  bot.on('kicked', (reason) => {
    const parsedReason = parseMinecraftMessage(reason)
    console.warn('⚠️ Kicked:', parsedReason)
    console.log('📋 Raw kick data:', JSON.stringify(reason, null, 2))
    clearIntervals()
    scheduleReconnect()
  })

  bot.on('error', (err) => {
    console.error('❌ Bot error:', err.message)
    
    if (err.message.includes('PartialReadError')) {
      console.log('💡 Hint: Try setting MC_VERSION env variable (e.g., "1.20.1")')
    }
    
    if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      console.log('🔌 Connection issue detected, will retry...')
    }
  })

  // Handle client errors without crashing
  if (bot._client) {
    bot._client.on('error', (err) => {
      console.error('❌ Client error:', err.message)
    })
  }

  // Keep-alive mechanism
  const keepAliveInterval = setInterval(() => {
    if (bot && bot.entity && bot.entity.position) {
      const pos = bot.entity.position
      if (Date.now() % (1000 * 60 * 5) < 30000) {
        console.log(`💓 Still connected at ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)}`)
      }
    }
  }, 30000)

  bot.once('end', () => {
    clearInterval(keepAliveInterval)
  })
}

function scheduleReconnect() {
  reconnectAttempts++
  const delay = Math.min(10000 * reconnectAttempts, 60000)
  
  console.log(`🔁 Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts})`)
  
  reconnectTimeout = setTimeout(() => {
    startBot()
  }, delay)
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...')
  clearIntervals()
  if (reconnectTimeout) clearTimeout(reconnectTimeout)
  if (bot) bot.quit()
  setTimeout(() => process.exit(0), 1000)
})

process.on('SIGTERM', () => {
  console.log('\n👋 Received SIGTERM, shutting down...')
  clearIntervals()
  if (reconnectTimeout) clearTimeout(reconnectTimeout)
  if (bot) bot.quit()
  setTimeout(() => process.exit(0), 1000)
})

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err.message)
  console.log('🔄 Attempting to recover...')
  clearIntervals()
  scheduleReconnect()
})

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled rejection:', err.message)
  console.log('🔄 Attempting to recover...')
})

// Start the bot
console.log('🚀 Starting AFK bot...')
console.log(`📍 Server: ${HOST}:${PORT}`)
console.log(`👤 Username: ${USERNAME}`)
console.log(`🔐 Auth: ${AUTH}`)
startBot()
