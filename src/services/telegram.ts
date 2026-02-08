/**
 * Telegram notification service
 * API: https://core.telegram.org/bots/api#sendmessage
 *
 * CRITICAL: Uses application/json (JSON body)
 * Message limit: 4096 chars
 * Supports HTML formatting via parse_mode: "HTML"
 */

import type { TelegramConfig, NotificationPayload } from "../types";

/**
 * Truncate text to max length, appending "… [truncated]" if over limit
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const suffix = "… [truncated]";
  return text.slice(0, maxLength - suffix.length) + suffix;
}

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
  try {
    // Format message with HTML bold title (already truncated internally)
    const text = formatMessage(payload);

    // Build JSON body
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

    // Check for non-2xx response
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[EveryNotify] Telegram error: ${response.status} ${errorText}`,
      );
      return;
    }
  } catch (error) {
    // Handle fetch errors (network, timeout, abort, etc.)
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EveryNotify] Telegram failed: ${message}`);
  }
}
