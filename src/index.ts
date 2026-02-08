/**
 * EveryNotify Plugin — Entry Point
 *
 * Implements the opencode plugin interface with three hooks:
 * - event: Handles session.idle, session.error, permission.updated events
 * - permission.ask: Handles permission requests (debounce handles overlap with event hook)
 * - tool.execute.before: Detects question tool usage
 *
 * Session enrichment:
 * - Calls client.session.get() to check parentID (subagent detection)
 * - Calls client.session.messages() to calculate elapsed time
 * - All SDK calls wrapped in try/catch with fallback to null
 */

import type { Plugin } from "@opencode-ai/plugin";
import * as path from "path";
import { loadConfig } from "./config";
import { createDispatcher } from "./dispatcher";
import { createLogger } from "./logger";
import type { NotificationPayload, EventType } from "./types";

/**
 * EveryNotify Plugin
 *
 * @param input - PluginInput from opencode SDK
 * @returns Hooks object with event, permission.ask, and tool.execute.before hooks
 */
const EverynotifyPlugin: Plugin = async (input) => {
  // Destructure ONLY safe intersection from PluginInput
  // Do NOT destructure app, project, or other fields (SDK variance)
  const { client, directory } = input;

  // Load configuration from global + project scopes
  const config = loadConfig(directory);

  // Create logger instance
  const logger = createLogger(config);

  // Create dispatcher with debouncing and timeout
  const { dispatch } = createDispatcher(config, logger);

  /**
   * Check if an event type is enabled in config
   * @param eventType - Event type to check
   * @returns true if enabled (default), false if explicitly disabled
   */
  function isEventEnabled(eventType: EventType): boolean {
    return config.events[eventType] !== false;
  }

  /**
   * Build notification payload with session enrichment
   *
   * @param eventType - Type of event that triggered notification
   * @param sessionID - opencode session ID (from event properties or null)
   * @param extraMessage - Optional additional message to append
   * @returns NotificationPayload with enriched session data
   */
  async function buildPayload(
    eventType: EventType,
    sessionID: string | null,
    extraMessage?: string,
  ): Promise<NotificationPayload> {
    // Get project name from directory basename
    const projectName = directory ? path.basename(directory) : null;

    // Try to enrich with session info
    let elapsedSeconds: number | null = null;
    let isSubagent = false;
    let assistantText: string | null = null;

    try {
      if (sessionID) {
        // Check if this is a subagent session (has parentID)
        const sessionResult = await client.session.get({
          path: { id: sessionID },
        });
        if (sessionResult.data?.parentID) {
          isSubagent = true;
        }

        // Calculate elapsed time from messages
        const messagesResult = await client.session.messages({
          path: { id: sessionID },
        });
        const messages = messagesResult.data;
        if (messages && messages.length > 0) {
          // Find first user message timestamp
          const firstUserMessage = messages.find(
            (msg: any) => msg.info?.role === "user",
          );
          if (firstUserMessage?.info?.time?.created) {
            const startTime = new Date(
              firstUserMessage.info.time.created,
            ).getTime();
            const now = Date.now();
            elapsedSeconds = Math.floor((now - startTime) / 1000);
          }

          const lastAssistantMessage = [...messages]
            .reverse()
            .find((msg: any) => msg.info?.role === "assistant");
          if (lastAssistantMessage?.parts) {
            const textParts = lastAssistantMessage.parts.filter(
              (part: any) => part.type === "text",
            );
            if (textParts.length > 0) {
              const lastTextPart: any = textParts[textParts.length - 1];
              const text = lastTextPart.text?.trim();
              if (text) {
                assistantText = text;
              }
            }
          }
        }
      }
    } catch (error) {
      // Fall back to null on error — SDK calls may fail
      // Do not log error here (too noisy)
    }

    // Adjust event type for subagent completion
    let finalEventType = eventType;
    if (eventType === "complete" && isSubagent) {
      finalEventType = "subagent_complete";
    }

    const title = `[${finalEventType}] ${projectName || "opencode"}`;

    let message = extraMessage ?? assistantText ?? "Task completed";
    if (elapsedSeconds !== null) {
      const minutes = Math.floor(elapsedSeconds / 60);
      const seconds = elapsedSeconds % 60;
      message += ` (elapsed: ${minutes}m ${seconds}s)`;
    }

    return {
      eventType: finalEventType,
      title,
      message,
      projectName,
      timestamp: Date.now(),
      sessionID,
      elapsedSeconds,
    };
  }

  /**
   * Event hook — handles session.idle, session.error, permission.updated
   */
  async function eventHook({ event }: any): Promise<void> {
    try {
      const sessionID = event.properties?.sessionID || null;

      if (event.type === "session.idle") {
        // Check if complete event is enabled
        if (!isEventEnabled("complete")) {
          return;
        }
        // Session completed — dispatch "complete" (or "subagent_complete" if subagent)
        const payload = await buildPayload("complete", sessionID);
        // Check subagent_complete filter after detection
        if (
          payload.eventType === "subagent_complete" &&
          !isEventEnabled("subagent_complete")
        ) {
          return;
        }
        await dispatch(payload);
      } else if (event.type === "session.error") {
        // Check if error event is enabled
        if (!isEventEnabled("error")) {
          return;
        }
        // Session error — dispatch "error" with error message
        const rawError = event.properties?.error;
        const errorMessage =
          rawError?.data?.message ?? rawError?.name ?? "Unknown error";
        const payload = await buildPayload("error", sessionID, errorMessage);
        await dispatch(payload);
      } else if (event.type === "permission.updated") {
        // Check if permission event is enabled
        if (!isEventEnabled("permission")) {
          return;
        }
        // Permission requested — dispatch "permission"
        const payload = await buildPayload("permission", sessionID);
        await dispatch(payload);
      }
      // Ignore unknown event types (no error)
    } catch (error) {
      // Never throw from hooks — log error and continue
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[EveryNotify] Event hook error: ${errorMsg}`);
      logger.error(`Event hook error: ${errorMsg}`);
    }
  }

  /**
   * Permission.ask hook — handles permission requests
   * (debounce in dispatcher handles overlap with event hook)
   */
  async function permissionAskHook(input: any, _output: any): Promise<void> {
    try {
      // Check if permission event is enabled
      if (!isEventEnabled("permission")) {
        return;
      }
      const sessionID = input?.sessionID ?? null;
      const payload = await buildPayload("permission", sessionID);
      await dispatch(payload);
    } catch (error) {
      // Never throw from hooks — log error and continue
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[EveryNotify] Permission.ask hook error: ${errorMsg}`);
      logger.error(`Permission.ask hook error: ${errorMsg}`);
    }
  }

  /**
   * Tool.execute.before hook — detects question tool usage
   */
  async function toolExecuteBeforeHook(
    input: any,
    _output: any,
  ): Promise<void> {
    try {
      // Check if question event is enabled
      if (!isEventEnabled("question")) {
        return;
      }
      if (input.tool === "question") {
        const sessionID = input?.sessionID ?? null;
        const payload = await buildPayload("question", sessionID);
        await dispatch(payload);
      }
    } catch (error) {
      // Never throw from hooks — log error and continue
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(
        `[EveryNotify] Tool.execute.before hook error: ${errorMsg}`,
      );
      logger.error(`Tool.execute.before hook error: ${errorMsg}`);
    }
  }

  // Return hooks object
  return {
    event: eventHook,
    "permission.ask": permissionAskHook,
    "tool.execute.before": toolExecuteBeforeHook,
  };
};

// Export both default and named for compatibility
export default EverynotifyPlugin;
export { EverynotifyPlugin };
