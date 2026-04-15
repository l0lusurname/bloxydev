const mc = require('minecraft-protocol')

const HOST = 'donutsmp.net'
const PORT = 25565
const VERSION = '1.21.1'
const USERNAME = 'your_email@outlook.com'  // ← your Microsoft email

let client = null
let teamHomeInterval = null
let reconnectAttempt = 0
let reconnectTimer = null
let isConnecting = false

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function scheduleTeamHome(firstRun = false) {
  const delaySecs = firstRun ? 10 : randomBetween(60, 600)
  console.log(`⏰ Next /team home in ${delaySecs}s`)
  teamHomeInterval = setTimeout(() => {
    sendChat('/team home')
    scheduleTeamHome(false) // after first run, always use random interval
  }, delaySecs * 1000)
}

function sendChat(message) {
  if (!client) return
  try {
    const packetData = {
      message,
      timestamp: BigInt(Date.now()),
      salt: BigInt(0),
      signature: Buffer.alloc(0),
      signedPreview: false,
      previousMessages: [],
      lastRejectedMessage: null,
    }
    try {
      client.write('chat_message', packetData)
    } catch {
      client.write('chat', { message })
    }
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

function handleDisconnect(delaySeconds) {
  if (isConnecting) return
  stopIntervals()

  if (client) {
    client.removeAllListeners()
    try { client.end() } catch (_) {}
    client = null
  }

  if (reconnectTimer) return

  console.log(`🔁 Reconnecting in ${delaySeconds}s...`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delaySeconds * 1000)
}

function connect() {
  if (isConnecting) return
  isConnecting = true
  reconnectAttempt++
  console.log(`\n🔌 Connecting... (attempt ${reconnectAttempt})`)

  try {
    client = mc.createClient({
      host: HOST,
      port: PORT,
      version: VERSION,
      auth: 'microsoft',
      username: USERNAME,
      closeTimeout: 120000,
    })
  } catch (err) {
    console.error('❌ Failed to create client:', err.message)
    isConnecting = false
    scheduleReconnect(30)
    return
  }

  client.on('error', (err) => {
    console.error('❌ Error:', err.message)
    isConnecting = false
    handleDisconnect(20)
  })

  client.on('login', () => {
    console.log('✅ Logged in!')
    isConnecting = false
    reconnectAttempt = 0
    scheduleTeamHome(true) // ← always start with the 10s first-run delay
  })

  client.on('spawn', () => {
    console.log('🌍 Spawned and ready!')
  })

  client.on('keep_alive', (packet) => {
    try {
      client.write('keep_alive', { keepAliveId: packet.keepAliveId })
    } catch (_) {}
  })

  client.on('kick_disconnect', (packet) => {
    isConnecting = false
    let reason = packet.reason
    try { reason = JSON.parse(reason) } catch (_) {}
    console.log('⚠️ Kicked:', JSON.stringify(reason, null, 2))
    handleDisconnect(15)
  })

  client.on('end', (reason) => {
    isConnecting = false
    console.log('🔌 Connection ended:', reason || 'no reason')
    handleDisconnect(20)
  })
}

function scheduleReconnect(delaySecs) {
  if (reconnectTimer) return
  console.log(`🔁 Reconnecting in ${delaySecs}s...`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delaySecs * 1000)
}

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught exception:', err.message)
  isConnecting = false
  handleDisconnect(20)
})

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled rejection:', reason)
})

connect()
