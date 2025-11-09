// Simple 24/7 AFK bot for DonutSMP (or any Minecraft server)
// ⚠️ Use only your own account and follow server rules.
const mineflayer = require('mineflayer')

const HOST = process.env.MC_HOST || 'donutsmp.net'
const PORT = parseInt(process.env.MC_PORT || '25565')
const USERNAME = process.env.MC_USERNAME
const PASSWORD = process.env.MC_PASSWORD
const AUTH = process.env.MC_AUTH || 'microsoft' // use 'microsoft' for modern accounts
const VERSION = process.env.MC_VERSION || false // auto-detect by default

if (!USERNAME) {
  console.error('❌ Missing MC_USERNAME environment variable')
  process.exit(1)
}

function startBot() {
  const botOptions = {
    host: HOST,
    port: PORT,
    username: USERNAME,
    auth: AUTH,
    // Add version detection and error handling
    version: VERSION,
    // Increase timeout for slow connections
    connectTimeout: 30000,
    // Skip some problematic packets
    hideErrors: false
  }

  // Only add password if it exists
  if (PASSWORD) {
    botOptions.password = PASSWORD
  }

  const bot = mineflayer.createBot(botOptions)

  bot.once('login', () => {
    console.log(`✅ Logged in as ${USERNAME}`)
    console.log(`📦 Protocol version: ${bot.version}`)
  })

  bot.once('spawn', () => {
    console.log('🌍 Spawned and idling peacefully...')
    
    // Optional tiny anti-timeout (not really needed if AFK is allowed)
    setInterval(() => {
      if (bot.entity) {
        bot.chat('/') // send "/" every 10min
      }
    }, 1000 * 60 * 10)
  })

  bot.on('end', (reason) => {
    console.log('⚠️ Disconnected:', reason)
    console.log('🔁 Reconnecting in 10s...')
    setTimeout(startBot, 10000)
  })

  bot.on('kicked', (reason) => {
    console.warn('⚠️ Kicked:', reason)
  })

  bot.on('error', (err) => {
    console.error('❌ Error:', err.message)
    // Don't crash on packet errors, let reconnect handle it
    if (err.message.includes('PartialReadError')) {
      console.log('💡 Hint: Try setting MC_VERSION env variable (e.g., "1.20.1")')
    }
  })

  // Handle packet errors gracefully
  bot._client.on('error', (err) => {
    console.error('❌ Client error:', err.message)
  })
}

startBot()
