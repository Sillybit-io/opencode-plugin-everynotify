/**
 * EveryNotify Plugin — Dispatcher
 *
 * Dispatches notifications to all enabled services in parallel with:
 * - Debouncing: 1000ms per event type (prevents duplicate notifications)
 * - Timeout: 5s per service call (via AbortController)
 * - Error isolation: One service failing doesn't block others (Promise.allSettled)
 */

import type {
  EverynotifyConfig,
  NotificationPayload,
  EventType,
} from "./types";
import { send as pushoverSend } from "./services/pushover";
import { send as telegramSend } from "./services/telegram";
import { send as slackSend } from "./services/slack";
import { send as discordSend } from "./services/discord";

/**
 * Truncate text to max length, appending "… [truncated]" if over limit
 * Shared utility function used by all services
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const suffix = "… [truncated]";
  // If maxLength is too small for suffix, return just the suffix
  if (maxLength <= suffix.length) {
    return suffix;
  }
  return text.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Service descriptor for enabled services
 */
interface ServiceDescriptor {
  name: string;
  send: (
    config: any,
    payload: NotificationPayload,
    signal: AbortSignal,
  ) => Promise<void>;
  config: any;
}

/**
 * Dispatcher interface returned by createDispatcher
 */
interface Dispatcher {
  dispatch: (payload: NotificationPayload) => Promise<void>;
}

/**
 * Create a dispatcher that sends notifications to all enabled services
 *
 * @param config - EverynotifyConfig with enabled services
 * @returns Dispatcher with dispatch() function
 */
export function createDispatcher(config: EverynotifyConfig): Dispatcher {
  // Build array of enabled services
  const services: ServiceDescriptor[] = [];

  if (config.pushover.enabled) {
    services.push({
      name: "Pushover",
      send: pushoverSend,
      config: config.pushover,
    });
  }

  if (config.telegram.enabled) {
    services.push({
      name: "Telegram",
      send: telegramSend,
      config: config.telegram,
    });
  }

  if (config.slack.enabled) {
    services.push({
      name: "Slack",
      send: slackSend,
      config: config.slack,
    });
  }

  if (config.discord.enabled) {
    services.push({
      name: "Discord",
      send: discordSend,
      config: config.discord,
    });
  }

  // Debouncing: track last dispatch time per event type
  const lastDispatchTime = new Map<EventType, number>();

  /**
   * Dispatch notification to all enabled services
   * - Debounces same event type within 1000ms
   * - Dispatches to all services in parallel with Promise.allSettled
   * - Applies 5s timeout to each service call
   * - Logs errors but never throws
   */
  async function dispatch(payload: NotificationPayload): Promise<void> {
    // Debounce: skip if same event type dispatched within 1000ms
    const now = Date.now();
    const lastTime = lastDispatchTime.get(payload.eventType) ?? 0;
    if (now - lastTime < 1000) {
      return; // Skip — debounced
    }
    lastDispatchTime.set(payload.eventType, now);

    // If no services enabled, return early (no-op)
    if (services.length === 0) {
      return;
    }

    // Create promises for all enabled services with timeout
    const promises = services.map(async (service) => {
      // Create AbortController with 5s timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        await service.send(service.config, payload, controller.signal);
      } finally {
        clearTimeout(timeoutId);
      }
    });

    // Wait for all services to complete (or fail)
    // Use Promise.allSettled to ensure one failure doesn't block others
    const results = await Promise.allSettled(promises);

    // Log any rejections
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `[EveryNotify] ${services[index].name} failed:`,
          result.reason,
        );
      }
    });
  }

  return { dispatch };
}
