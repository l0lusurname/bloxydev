const mc = require('bedrock-protocol')

const HOST = 'donutsmp.net'
const PORT = 19132
const VERSION = '1.21.50'
const OWNER = 'your_username_here' // ← your IGN, for PM detection

let client = null
let homeInterval = null
let reconnectAttempt = 0
let reconnectTimer = null
let isConnecting = false

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function scheduleHome(firstRun = false) {
  const delaySecs = firstRun ? 10 : randomBetween(60, 600)
  console.log(`⏰ Next /home 1 in ${delaySecs}s`)
  homeInterval = setTimeout(() => {
    sendChat('/home 1')
    scheduleHome(false)
  }, delaySecs * 1000)
}

function sendChat(message) {
  if (!client) return
  try {
    client.queue('text', {
      type: 'chat',
      needs_translation: false,
      source_name: client.username,
      xuid: '',
      platform_chat_id: '',
      message,
    })
    console.log(`💬 Sent: ${message}`)
  } catch (e) {
    console.warn(`⚠️ Failed to send: ${e.message}`)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function icecreamRoutine() {
  console.log('🍦 icecream triggered!')

  // Step 1: /tpa smog39
  sendChat('/tpa smog39')
  await sleep(3000) // wait for GUI to open

  // Step 2: Click green glass pane (accept button)
  // In Bedrock, GUIs are window slots — green glass pane is typically slot 11 in a confirm GUI
  try {
    client.queue('inventory_transaction', {
      legacy: {
        request_id: 0,
        request_changes_type: 0,
        actions: [],
        transaction_type: 0,
        transaction_data: {},
      },
      actions: [
        {
          source: { type: 0, flags: 0, inventory_id: 0 },
          destination: { type: 0, flags: 0, inventory_id: 0 },
          slot_id: 11, // green glass pane slot — adjust if needed
          old_item: { network_id: 0, count: 0 },
          new_item: { network_id: 0, count: 0 },
        }
      ]
    })
    console.log('🟢 Clicked green glass pane (slot 11)')
  } catch (e) {
    console.warn('⚠️ Click failed:', e.message)
  }

  // Step 3: Wait 15 seconds
  console.log('⏳ Waiting 15s...')
  await sleep(15000)

  // Step 4: /sethome
  sendChat('/sethome')
  console.log('🏠 /sethome sent!')
}

function handleIncomingText(packet) {
  // Bedrock PM format: "username whispers to you: message" or "§7username§r whispers..."
  const raw = packet.message || ''
  const stripped = raw.replace(/§[0-9a-fk-or]/g, '').toLowerCase()

  console.log(`📨 Text packet: ${stripped}`)

  const isWhisper = packet.type === 'whisper' || stripped.includes('whispers to you')
  if (isWhisper && stripped.includes('icecream')) {
    icecreamRoutine()
  }
}

function stopIntervals() {
  if (homeInterval) {
    clearTimeout(homeInterval)
    homeInterval = null
  }
}

function handleDisconnect(delaySeconds) {
  if (isConnecting) return
  stopIntervals()

  if (client) {
    client.removeAllListeners()
    try { client.close() } catch (_) {}
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
      offline: false,
      authTitle: mc.title.MinecraftNintendoSwitch,
      connectTimeout: 120000,
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

  client.on('spawn', () => {
    console.log('✅ Spawned and ready!')
    isConnecting = false
    reconnectAttempt = 0
    scheduleHome(true)
  })

  client.on('text', (packet) => {
    handleIncomingText(packet)
  })

  client.on('kick', (packet) => {
    isConnecting = false
    console.log('⚠️ Kicked:', packet.message)
    handleDisconnect(15)
  })

  client.on('close', () => {
    isConnecting = false
    console.log('🔌 Connection closed')
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
