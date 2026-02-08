/**
 * Pushover notification service
 * API: https://pushover.net/api
 *
 * CRITICAL: Uses application/x-www-form-urlencoded (NOT JSON)
 * Message limit: 1024 chars
 * Title limit: 250 chars
 */

import type { PushoverConfig, NotificationPayload } from "../types";

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
  try {
    // Build form-urlencoded body using URLSearchParams
    const body = new URLSearchParams({
      token: config.token,
      user: config.userKey,
      message: truncate(payload.message, 1024),
      title: truncate(payload.title, 250),
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

    // Check for non-2xx response
    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[EveryNotify] Pushover error: ${response.status} ${errorText}`,
      );
      return;
    }
  } catch (error) {
    // Handle fetch errors (network, timeout, abort, etc.)
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EveryNotify] Pushover failed: ${message}`);
  }
}
