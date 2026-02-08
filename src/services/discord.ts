/**
 * Discord notification service
 * API: https://discord.com/developers/docs/resources/webhook#execute-webhook
 *
 * CRITICAL: Uses application/json
 * Message limit: 2000 chars (Discord webhook content field limit)
 * Rate limit: 10 requests per 10 seconds per webhook
 */

import type { DiscordConfig, NotificationPayload } from "../types";

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
  try {
    // Format message and truncate to Discord's 2000 char limit
    const content = truncate(formatDiscordMessage(payload), 2000);

    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
      signal,
    });

    // Check for rate limit (429)
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      console.error(
        `[EveryNotify] Discord rate limited. Retry-After: ${retryAfter}s`,
      );
      return;
    }

    // Check for non-2xx response
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[EveryNotify] Discord error: ${response.status} ${errorText}`,
      );
      return;
    }
  } catch (error) {
    // Handle fetch errors (network, timeout, abort, etc.)
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EveryNotify] Discord failed: ${message}`);
  }
}
