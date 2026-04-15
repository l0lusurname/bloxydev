const mc = require('minecraft-protocol')

const HOST = 'donutsmp.net'   // change if needed
const PORT = 25565
const VERSION = '1.21.1'      // use a stable supported version; change if server accepts others

let client = null
let teamHomeInterval = null
let reconnectAttempt = 0

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function scheduleTeamHome() {
  const delay = randomBetween(1, 10) * 60 * 1000 // 1–10 minutes in ms
  console.log(`⏰ Next /team home in ${Math.round(delay / 1000)}s`)
  teamHomeInterval = setTimeout(() => {
    sendChat('/team home')
    scheduleTeamHome() // reschedule after each run
  }, delay)
}

function sendChat(message) {
  if (!client) return
  try {
    // 1.19+ uses 'chat_message', older uses 'chat'
    client.write('chat', { message })
    console.log(`💬 Sent: ${message}`)
  } catch (e) {
    console.warn(`⚠️ Failed to send message: ${e.message}`)
  }
}

function stopIntervals() {
  if (teamHomeInterval) {
    clearTimeout(teamHomeInterval)
    teamHomeInterval = null
  }
}

function connect() {
  console.log(`\n🔌 Connecting... (attempt ${++reconnectAttempt})`)

  client = mc.createClient({
    host: HOST,
    port: PORT,
    version: VERSION,
    auth: 'microsoft',        // triggers Microsoft OAuth flow on first run
    // profilesFolder: './profiles', // optional: cache auth tokens here
  })

  client.on('login', () => {
    console.log('✅ Logged in!')
    reconnectAttempt = 0
    scheduleTeamHome()
  })

  client.on('spawn', () => {
    console.log('🌍 Spawned and ready!')
  })

  // Keep alive — respond to server keep-alive packets
  client.on('keep_alive', (packet) => {
    client.write('keep_alive', { keepAliveId: packet.keepAliveId })
  })

  client.on('kick_disconnect', (packet) => {
    let reason = packet.reason
    try { reason = JSON.parse(reason) } catch (_) {}
    console.log('⚠️ Kicked:', reason)
    handleDisconnect(10)
  })

  client.on('end', (reason) => {
    console.log('🔌 Connection ended:', reason || 'no reason')
    handleDisconnect(20)
  })

  client.on('error', (err) => {
    console.error('❌ Error:', err.message)
    handleDisconnect(15)
  })
}

let reconnectTimer = null

function handleDisconnect(delaySeconds) {
  stopIntervals()

  if (client) {
    client.removeAllListeners()
    client.end()
    client = null
  }

  if (reconnectTimer) return // already scheduled

  console.log(`🔁 Reconnecting in ${delaySeconds}s...`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delaySeconds * 1000)
}

connect()
