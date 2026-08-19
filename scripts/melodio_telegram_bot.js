const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const TelegramBotRaw = require('node-telegram-bot-api');
const TelegramBot = typeof TelegramBotRaw === 'function' ? TelegramBotRaw : (TelegramBotRaw.TelegramBot || TelegramBotRaw.default);

// Load environment variables from .env.local
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  console.error("Missing .env.local file");
  process.exit(1);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT_ID = parseInt(process.env.TELEGRAM_CHAT_ID || '814032806', 10);

if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in .env.local");
  process.exit(1);
}

const POLLING_BASE_DELAY_MS = 5_000;
const POLLING_MAX_DELAY_MS = 5 * 60_000;
const AUTH_RETRY_DELAY_MS = 30 * 60_000;
const POLLING_HEALTHY_RESET_MS = 10 * 60_000;

const bot = new TelegramBot(token, {
  polling: {
    autoStart: false,
    interval: 1_000,
    params: { timeout: 30 }
  }
});

let consecutivePollingErrors = 0;
let pollingRestartPending = false;
let pollingRestartTimer = null;
let pollingHealthyTimer = null;

const mainKeyboard = {
  keyboard: [
    [
      { text: '/Wiki(S)' },
      { text: '/Set' },
      { text: '/J-Set' },
      { text: '/Delete' }
    ]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
};

function getTelegramStatus(error) {
  return error?.response?.statusCode
    || error?.response?.status
    || error?.response?.body?.error_code
    || null;
}

function getRetryDelay(error) {
  const status = getTelegramStatus(error);
  if (status === 401 || status === 403) return AUTH_RETRY_DELAY_MS;

  const retryAfterSeconds = Number(error?.response?.body?.parameters?.retry_after);
  if (status === 429 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.max(retryAfterSeconds * 1_000, POLLING_BASE_DELAY_MS);
  }

  return Math.min(
    POLLING_BASE_DELAY_MS * (2 ** Math.max(0, consecutivePollingErrors - 1)),
    POLLING_MAX_DELAY_MS
  );
}

function schedulePollingRestart(error) {
  if (pollingRestartPending) return;

  consecutivePollingErrors += 1;
  pollingRestartPending = true;
  if (pollingHealthyTimer) {
    clearTimeout(pollingHealthyTimer);
    pollingHealthyTimer = null;
  }
  const delayMs = getRetryDelay(error);
  const status = getTelegramStatus(error);
  console.error(
    `[Gateway] Telegram polling paused after ${error?.code || status || 'unknown'} error. `
    + `Retrying in ${Math.ceil(delayMs / 1_000)}s.`
  );

  void bot.stopPolling({ cancel: true, reason: 'Backoff after polling error' })
    .catch((stopError) => {
      console.error(`[Gateway] Failed to stop polling cleanly: ${stopError.message}`);
    })
    .finally(() => {
      pollingRestartTimer = setTimeout(() => {
        pollingRestartTimer = null;
        pollingRestartPending = false;
        void startPollingSafely();
      }, delayMs);
    });
}

async function startPollingSafely() {
  try {
    await bot.getMe();
    await bot.startPolling();
    pollingHealthyTimer = setTimeout(() => {
      consecutivePollingErrors = 0;
      pollingHealthyTimer = null;
    }, POLLING_HEALTHY_RESET_MS);
    console.log('🤖 Melodio Muse Telegram Gateway Started (Polling Mode)...');
  } catch (error) {
    schedulePollingRestart(error);
  }
}

bot.on('polling_error', (error) => {
  schedulePollingRestart(error);
});

// Helper to forward payloads to n8n with auto-fallback from test to production webhook
async function forwardToN8n(payload) {
  const testUrl = 'http://localhost:5678/webhook-test/telegram-events';
  const prodUrl = 'http://localhost:5678/webhook/telegram-events';

  try {
    console.log(`[Gateway] Attempting to forward to test webhook...`);
    const testResponse = await fetch(testUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (testResponse.ok) {
      console.log(`[Gateway] Successfully forwarded to test webhook!`);
      return;
    }

    console.log(`[Gateway] Test webhook returned ${testResponse.status}. Falling back to production...`);
  } catch (err) {
    console.log(`[Gateway] Test webhook connection failed: ${err.message}. Falling back to production...`);
  }

  try {
    const prodResponse = await fetch(prodUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!prodResponse.ok) {
      console.error(`[Gateway] Production webhook returned error status: ${prodResponse.status}`);
    } else {
      console.log(`[Gateway] Successfully forwarded to production webhook!`);
    }
  } catch (err) {
    console.error('[Gateway] Failed to forward to production webhook:', err.message);
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  if (chatId !== ALLOWED_CHAT_ID) {
    console.log(`[Security] Ignored message from unauthorized Chat ID: ${chatId}`);
    return;
  }

  if (msg.text === '/start') {
    console.log(`[Gateway] Initializing user keyboard for chat ${chatId}`);
    await bot.sendMessage(chatId, '⚠️ 하단의 메뉴 버튼(/Wiki(S), /Set, /J-Set, /Delete)을 먼저 클릭하고 진행해 주세요.\n\nThis message was sent automatically with n8n', {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard
    });
    return;
  }

  if (['/wiki(a)', '/add_wiki', '/add_wiki(a)'].includes((msg.text || '').trim().toLowerCase())) {
    await bot.sendMessage(chatId, '❌ Wiki 자동 추가 기능은 비활성화되었습니다.', {
      reply_markup: mainKeyboard
    });
    return;
  }

  console.log(`[Gateway] Forwarding message from ${chatId}: "${msg.text || ''}"`);
  await forwardToN8n({ message: msg });
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  if (chatId !== ALLOWED_CHAT_ID) {
    console.log(`[Security] Ignored callback from unauthorized Chat ID: ${chatId}`);
    return;
  }
  console.log(`[Gateway] Forwarding callback from ${chatId}: data="${query.data}"`);
  await forwardToN8n({ callback_query: query });
});

process.once('SIGINT', () => {
  if (pollingRestartTimer) clearTimeout(pollingRestartTimer);
  if (pollingHealthyTimer) clearTimeout(pollingHealthyTimer);
  void bot.stopPolling({ cancel: true, reason: 'SIGINT' }).finally(() => process.exit(0));
});

process.once('SIGTERM', () => {
  if (pollingRestartTimer) clearTimeout(pollingRestartTimer);
  if (pollingHealthyTimer) clearTimeout(pollingHealthyTimer);
  void bot.stopPolling({ cancel: true, reason: 'SIGTERM' }).finally(() => process.exit(0));
});

void startPollingSafely();
