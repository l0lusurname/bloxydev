// Simple Mineflayer "stay-online" bot for donutsmp.net
// WARNING: Use only with accounts you own and obey server rules.

const mineflayer = require('mineflayer');
const { pathfinder, Movements } = require('mineflayer-pathfinder');

const HOST = process.env.MC_HOST || 'donutsmp.net';
const PORT = process.env.MC_PORT ? parseInt(process.env.MC_PORT) : 25565;
const USERNAME = process.env.MC_USERNAME; // set this in Railway
const PASSWORD = process.env.MC_PASSWORD; // optional (depends on auth flow)
const AUTH = process.env.MC_AUTH || undefined; // optional, e.g. 'microsoft' if you provide token-based auth

if (!USERNAME) {
  console.error('Missing MC_USERNAME environment variable. Set it before running.');
  process.exit(1);
}

function createBot() {
  const options = {
    host: HOST,
    port: PORT,
    username: USERNAME
  };
  if (PASSWORD) options.password = PASSWORD;
  if (AUTH) options.auth = AUTH; // some setups use 'microsoft' or other auth types

  const bot = mineflayer.createBot(options);

  bot.loadPlugin(pathfinder);

  bot.on('login', () => {
    console.log('Logged in as', USERNAME);
  });

  bot.on('spawn', () => {
    console.log('Spawned in world. Setting up keep-alive behavior.');

    // Simple periodic activity to avoid AFK timeout:
    //  - look around
    //  - send a tiny chat message every 10 minutes (optional; servers sometimes rate-limit)
    //  - toggle sprint/jump occasionally
    let yaw = 0;
    setInterval(() => {
      try {
        yaw += Math.PI / 8;
        const pos = bot.entity.position.offset(Math.cos(yaw), 0, Math.sin(yaw));
        bot.lookAt(pos, true, () => {});
        // small hop
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 300);
      } catch (e) {
        // ignore
      }
    }, 30 * 1000); // every 30s

    // optional lightweight chat to appear active (uncomment if allowed)
    // setInterval(() => {
    //   bot.chat('/me is here'); // don't spam / be mindful of server rules
    // }, 10 * 60 * 1000); // every 10 min
  });

  bot.on('end', (reason) => {
    console.log('Disconnected:', reason, '— reconnecting in 10s');
    setTimeout(createBot, 10000);
  });

  bot.on('kicked', (reason) => {
    console.warn('Kicked:', reason);
  });

  bot.on('error', (err) => {
    console.error('Error:', err);
  });
}

createBot();
