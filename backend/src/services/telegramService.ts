import dotenv from 'dotenv';
dotenv.config();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function sendTelegramMessage(message: string, chatId?: string | number): Promise<any> {
  const targetChatId = chatId || DEFAULT_CHAT_ID;

  if (!BOT_TOKEN || !targetChatId) {
    throw new Error('Telegram Bot Token or Chat ID not configured');
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.description || 'Failed to send Telegram message');
  }

  return data;
}
