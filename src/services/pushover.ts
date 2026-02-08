/**
 * Pushover notification service
 * API: https://pushover.net/api
 *
 * CRITICAL: Uses application/x-www-form-urlencoded (NOT JSON)
 * Message limit: 1024 chars
 * Title limit: 250 chars
 */

import type { PushoverConfig, NotificationPayload } from "../types";
import { truncate } from "../dispatcher";

/**
 * Send notification via Pushover API
 *
 * @param config - Pushover configuration (token, userKey, priority)
 * @param payload - Notification payload (title, message, etc.)
 * @param signal - AbortSignal for timeout control
 */
export async function send(
  config: PushoverConfig,
  payload: NotificationPayload,
  signal: AbortSignal,
): Promise<void> {
  const body = new URLSearchParams({
    token: config.token,
    user: config.userKey,
    message: truncate(payload.message, 1024, config.truncateFrom),
    title: truncate(payload.title, 250, config.truncateFrom),
    priority: String(config.priority ?? 0),
  });

  const response = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pushover API error: ${response.status} ${errorText}`);
  }
}
