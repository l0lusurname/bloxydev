// Simple 24/7 AFK bot for DonutSMP (or any Minecraft server)
// ⚠️ Use only your own account and follow server rules.

const mineflayer = require('mineflayer')

const HOST = process.env.MC_HOST || 'donutsmp.net'
const PORT = parseInt(process.env.MC_PORT || '25565')
const USERNAME = process.env.MC_USERNAME
const PASSWORD = process.env.MC_PASSWORD
const AUTH = process.env.MC_AUTH || 'microsoft' // use 'microsoft' for modern accounts

if (!USERNAME) {
  console.error('❌ Missing MC_USERNAME environment variable')
  process.exit(1)
}

function startBot() {
  const bot = mineflayer.createBot({
    host: HOST,
    port: PORT,
    username: USERNAME,
    password: PASSWORD,
    auth: AUTH
  })

  bot.on('login', () => {
    console.log(`✅ Logged in as ${USERNAME}`)
  })

  bot.on('spawn', () => {
    console.log('🌍 Spawned and idling peacefully...')
    // Optional tiny anti-timeout (not really needed if AFK is allowed)
    setInterval(() => bot.chat('/'), 1000 * 60 * 10) // send "/" every 10min
  })

  bot.on('end', (reason) => {
    console.log('⚠️ Disconnected:', reason)
    console.log('🔁 Reconnecting in 10s...')
    setTimeout(startBot, 10000)
  })

  bot.on('kicked', (reason) => console.warn('Kicked:', reason))
  bot.on('error', (err) => console.error('Error:', err))
}

startBot()
