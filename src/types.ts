/**
 * EveryNotify Plugin — Shared Type Definitions
 *
 * All types for notification payloads, service configurations, and dispatch functions.
 * No validation logic here — types only.
 */

/**
 * Event types that trigger notifications
 */
export type EventType =
  | "complete"
  | "subagent_complete"
  | "error"
  | "permission"
  | "question";

/**
 * Notification payload sent to all enabled services
 */
export interface NotificationPayload {
  eventType: EventType;
  title: string;
  message: string;
  projectName: string | null;
  timestamp: number;
  sessionID: string | null;
  elapsedSeconds: number | null;
}

/**
 * Pushover service configuration
 * API: https://pushover.net/api
 * - token: 30-character app token
 * - userKey: 30-character user key
 * - priority: optional priority level (-2 to 2)
 */
export interface PushoverConfig {
  enabled: boolean;
  token: string;
  userKey: string;
  priority?: number;
}

/**
 * Telegram service configuration
 * API: https://core.telegram.org/bots/api#sendmessage
 * - botToken: bot token from BotFather
 * - chatId: target chat ID
 */
export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

/**
 * Slack service configuration
 * API: https://api.slack.com/messaging/webhooks
 * - webhookUrl: incoming webhook URL
 */
export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
}

/**
 * Discord service configuration
 * API: https://discord.com/developers/docs/resources/webhook#execute-webhook
 * - webhookUrl: webhook URL
 */
export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
}

/**
 * Logging configuration
 * Controls debug output and error logging behavior
 * - enabled: whether logging is active
 * - level: minimum log level to output ("error" or "warn")
 */
export interface LogConfig {
  enabled: boolean;
  level?: "error" | "warn";
}

/**
 * Top-level configuration object containing all service configs
 */
export interface EverynotifyConfig {
  pushover: PushoverConfig;
  telegram: TelegramConfig;
  slack: SlackConfig;
  discord: DiscordConfig;
  log: LogConfig;
}

/**
 * Function signature for service send functions
 * Each service implements this interface
 */
export type ServiceSendFunction = (
  config: any,
  payload: NotificationPayload,
  signal: AbortSignal,
) => Promise<void>;
