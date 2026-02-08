/**
 * Telegram notification service
 * API: https://core.telegram.org/bots/api#sendmessage
 *
 * CRITICAL: Uses application/json (JSON body)
 * Message limit: 4096 chars
 * Supports HTML formatting via parse_mode: "HTML"
 */

import type { TelegramConfig, NotificationPayload } from "../types";
import { truncate } from "../dispatcher";

/**
 * Format message with HTML bold title
 * Format: <b>Title</b>\nMessage
 */
function formatMessage(payload: NotificationPayload): string {
  const truncatedTitle = truncate(payload.title, 250);
  const truncatedMessage = truncate(payload.message, 3840);
  return `<b>${truncatedTitle}</b>\n${truncatedMessage}`;
}

/**
 * Send notification via Telegram Bot API
 *
 * @param config - Telegram configuration (botToken, chatId)
 * @param payload - Notification payload (title, message, etc.)
 * @param signal - AbortSignal for timeout control
 */
export async function send(
  config: TelegramConfig,
  payload: NotificationPayload,
  signal: AbortSignal,
): Promise<void> {
  const text = formatMessage(payload);

  const body = JSON.stringify({
    chat_id: config.chatId,
    text,
    parse_mode: "HTML",
  });

  const response = await fetch(
    `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      signal,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram API error: ${response.status} ${errorText}`);
  }
}
