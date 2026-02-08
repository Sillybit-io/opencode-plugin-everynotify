/**
 * Slack notification service
 * API: https://api.slack.com/messaging/webhooks
 *
 * Uses Incoming Webhooks with JSON POST
 * Message limit: 40000 chars (Slack text field limit)
 * Formatting: mrkdwn (Slack markdown)
 */

import type { SlackConfig, NotificationPayload } from "../types";
import { truncate } from "../dispatcher";

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
  const text = truncate(formatSlackMessage(payload), 40000);

  const response = await fetch(config.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Slack API error: ${response.status} ${errorText}`);
  }
}
