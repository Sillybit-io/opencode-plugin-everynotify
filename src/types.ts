/**
 * EveryNotify Plugin — Shared Type Definitions
 *
 * All types for notification payloads, service configurations, and dispatch functions.
 * No validation logic here — types only.
 */

/**
 * Truncation direction for messages exceeding service limits
 * - "end": Keep beginning, truncate end (default)
 * - "start": Keep end, truncate beginning
 */
export type TruncationMode = "start" | "end";

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
  truncateFrom?: TruncationMode;
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
  truncateFrom?: TruncationMode;
}

/**
 * Slack service configuration
 * API: https://api.slack.com/messaging/webhooks
 * - webhookUrl: incoming webhook URL
 */
export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
  truncateFrom?: TruncationMode;
}

/**
 * Discord service configuration
 * API: https://discord.com/developers/docs/resources/webhook#execute-webhook
 * - webhookUrl: webhook URL
 */
export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
  truncateFrom?: TruncationMode;
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
 * Events configuration
 * Controls which event types trigger notifications
 * - complete: main session completion events
 * - subagent_complete: subagent task completion events
 * - error: session error events
 * - permission: permission request events
 * - question: question tool usage events
 */
export interface EventsConfig {
  complete: boolean;
  subagent_complete: boolean;
  error: boolean;
  permission: boolean;
  question: boolean;
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
  events: EventsConfig;
  truncateFrom?: TruncationMode;
  delay?: number;
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
