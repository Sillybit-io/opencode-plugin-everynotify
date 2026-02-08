/**
 * Slack notification service
 * API: https://api.slack.com/messaging/webhooks
 *
 * Uses Incoming Webhooks with JSON POST
 * Message limit: 40000 chars (Slack text field limit)
 * Formatting: mrkdwn (Slack markdown)
 */

import type { SlackConfig, NotificationPayload } from "../types";

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
 * Format notification payload as Slack mrkdwn message
 * Bold title followed by message body
 */
function formatSlackMessage(payload: NotificationPayload): string {
  return `*${payload.title}*\n${payload.message}`;
}

/**
 * Send notification via Slack Incoming Webhook
 *
 * @param config - Slack configuration (webhookUrl)
 * @param payload - Notification payload (title, message, etc.)
 * @param signal - AbortSignal for timeout control
 */
export async function send(
  config: SlackConfig,
  payload: NotificationPayload,
  signal: AbortSignal,
): Promise<void> {
  try {
    // Format message with mrkdwn and truncate to 40000 chars
    const text = truncate(formatSlackMessage(payload), 40000);

    const response = await fetch(config.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
      signal,
    });

    // Check for non-2xx response
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[EveryNotify] Slack error: ${response.status} ${errorText}`,
      );
      return;
    }
  } catch (error) {
    // Handle fetch errors (network, timeout, abort, etc.)
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EveryNotify] Slack failed: ${message}`);
  }
}
