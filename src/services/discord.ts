/**
 * Discord notification service
 * API: https://discord.com/developers/docs/resources/webhook#execute-webhook
 *
 * CRITICAL: Uses application/json
 * Message limit: 2000 chars (Discord webhook content field limit)
 * Rate limit: 10 requests per 10 seconds per webhook
 */

import type { DiscordConfig, NotificationPayload } from "../types";
import { truncate } from "../dispatcher";

/**
 * Format notification payload as Discord markdown message
 * Uses Discord markdown: **bold** for title
 */
function formatDiscordMessage(payload: NotificationPayload): string {
  return `**${payload.title}**\n${payload.message}`;
}

/**
 * Send notification via Discord webhook API
 *
 * @param config - Discord configuration (webhookUrl)
 * @param payload - Notification payload (title, message, etc.)
 * @param signal - AbortSignal for timeout control
 */
export async function send(
  config: DiscordConfig,
  payload: NotificationPayload,
  signal: AbortSignal,
): Promise<void> {
  const content = truncate(
    formatDiscordMessage(payload),
    2000,
    config.truncateFrom,
  );

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
    signal,
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    throw new Error(`Discord rate limited. Retry-After: ${retryAfter}s`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Discord API error: ${response.status} ${errorText}`);
  }
}
