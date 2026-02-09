/**
 * EveryNotify Plugin — Dispatcher
 *
 * Dispatches notifications to all enabled services in parallel with:
 * - Delay queue: configurable delay per event type with replace-on-duplicate
 * - Immediate events: error/permission bypass delay with 500ms dedup
 * - Timeout: 5s per service call (via AbortController)
 * - Error isolation: One service failing doesn't block others (Promise.allSettled)
 */

import type {
  EverynotifyConfig,
  NotificationPayload,
  EventType,
  TruncationMode,
} from "./types";
import type { Logger } from "./logger";
import { send as pushoverSend } from "./services/pushover";
import { send as telegramSend } from "./services/telegram";
import { send as slackSend } from "./services/slack";
import { send as discordSend } from "./services/discord";

export function truncate(
  text: string,
  maxLength: number,
  from: TruncationMode = "end",
): string {
  if (text.length <= maxLength) {
    return text;
  }
  const indicator = "...";
  if (maxLength <= indicator.length) {
    return indicator;
  }
  if (from === "start") {
    return indicator + text.slice(text.length - (maxLength - indicator.length));
  }
  return text.slice(0, maxLength - indicator.length) + indicator;
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
  flush: () => Promise<void>;
}

/**
 * Create a dispatcher that sends notifications to all enabled services
 *
 * @param config - EverynotifyConfig with enabled services
 * @param logger - Logger instance for error logging
 * @returns Dispatcher with dispatch() function
 */
export function createDispatcher(
  config: EverynotifyConfig,
  logger: Logger,
): Dispatcher {
  // Build array of enabled services
  const services: ServiceDescriptor[] = [];

  const globalTruncateFrom = config.truncateFrom ?? "end";

  if (config.pushover.enabled) {
    services.push({
      name: "Pushover",
      send: pushoverSend,
      config: {
        ...config.pushover,
        truncateFrom: config.pushover.truncateFrom ?? globalTruncateFrom,
      },
    });
  }

  if (config.telegram.enabled) {
    services.push({
      name: "Telegram",
      send: telegramSend,
      config: {
        ...config.telegram,
        truncateFrom: config.telegram.truncateFrom ?? globalTruncateFrom,
      },
    });
  }

  if (config.slack.enabled) {
    services.push({
      name: "Slack",
      send: slackSend,
      config: {
        ...config.slack,
        truncateFrom: config.slack.truncateFrom ?? globalTruncateFrom,
      },
    });
  }

  if (config.discord.enabled) {
    services.push({
      name: "Discord",
      send: discordSend,
      config: {
        ...config.discord,
        truncateFrom: config.discord.truncateFrom ?? globalTruncateFrom,
      },
    });
  }

  const delayMs = Math.max(0, Math.floor(Number(config.delay ?? 120))) * 1000;

  const IMMEDIATE_EVENTS: Set<EventType> = new Set(["error", "permission"]);

  const pendingTimers = new Map<
    EventType,
    { timer: ReturnType<typeof setTimeout>; payload: NotificationPayload }
  >();

  // 500ms dedup prevents permission dual-hook regression (permission.updated + permission.ask)
  const lastImmediateTime = new Map<EventType, number>();

  async function sendToServices(payload: NotificationPayload): Promise<void> {
    if (services.length === 0) {
      return;
    }

    const promises = services.map(async (service) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        await service.send(service.config, payload, controller.signal);
      } finally {
        clearTimeout(timeoutId);
      }
    });

    const results = await Promise.allSettled(promises);

    results.forEach((result, index) => {
      if (result.status === "rejected") {
        const errorMsg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        logger.error(`${services[index].name} failed: ${errorMsg}`);
      }
    });
  }

  async function dispatch(payload: NotificationPayload): Promise<void> {
    if (delayMs === 0) {
      await sendToServices(payload);
      return;
    }

    if (IMMEDIATE_EVENTS.has(payload.eventType)) {
      const now = Date.now();
      const lastTime = lastImmediateTime.get(payload.eventType) ?? 0;
      if (now - lastTime < 500) {
        return;
      }
      lastImmediateTime.set(payload.eventType, now);
      await sendToServices(payload);
      return;
    }

    const existing = pendingTimers.get(payload.eventType);
    if (existing) {
      clearTimeout(existing.timer);
      pendingTimers.delete(payload.eventType);
    }

    // Do NOT await — delayed events return immediately (fire-and-forget)
    const timer = setTimeout(async () => {
      pendingTimers.delete(payload.eventType);
      await sendToServices(payload);
    }, delayMs);

    pendingTimers.set(payload.eventType, { timer, payload });
  }

  async function flush(): Promise<void> {
    const entries = Array.from(pendingTimers.values());
    pendingTimers.clear();

    for (const entry of entries) {
      clearTimeout(entry.timer);
    }

    if (entries.length === 0) {
      return;
    }

    const flushPromises = entries.map((entry) => sendToServices(entry.payload));
    await Promise.allSettled(flushPromises);
  }

  return { dispatch, flush };
}
