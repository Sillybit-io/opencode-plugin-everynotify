/**
 * EveryNotify Plugin — Configuration Loader
 *
 * Loads configuration from:
 * 1. Global: ~/.config/opencode/.everynotify.json
 * 2. Project: .opencode/.everynotify.json (in project directory)
 *
 * Merge order: defaults ← global ← project (project wins)
 * All services disabled by default.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { EverynotifyConfig } from "./types";

/**
 * Default configuration — all services disabled, empty credentials
 */
export const DEFAULT_CONFIG: EverynotifyConfig = {
  pushover: {
    enabled: false,
    token: "",
    userKey: "",
    priority: 0,
  },
  telegram: {
    enabled: false,
    botToken: "",
    chatId: "",
  },
  slack: {
    enabled: false,
    webhookUrl: "",
  },
  discord: {
    enabled: false,
    webhookUrl: "",
  },
  log: {
    enabled: false,
    level: "warn",
  },
  events: {
    complete: true,
    subagent_complete: true,
    error: true,
    permission: true,
    question: true,
  },
};

/**
 * Get config file path for a given scope
 * @param scope "global" or "project"
 * @param directory project directory (used for project scope)
 * @returns full path to config file
 */
export function getConfigPath(
  scope: "global" | "project",
  directory: string,
): string {
  if (scope === "global") {
    return path.join(os.homedir(), ".config", "opencode", ".everynotify.json");
  }
  return path.join(directory, ".opencode", ".everynotify.json");
}

/**
 * Deep merge two config objects (2 levels deep)
 * @param target base config
 * @param source config to merge in (overwrites target)
 * @returns merged config
 */
function deepMerge(
  target: EverynotifyConfig,
  source: Partial<EverynotifyConfig>,
): EverynotifyConfig {
  const result = { ...target };

  // Merge each service config
  if (source.pushover) {
    result.pushover = { ...result.pushover, ...source.pushover };
  }
  if (source.telegram) {
    result.telegram = { ...result.telegram, ...source.telegram };
  }
  if (source.slack) {
    result.slack = { ...result.slack, ...source.slack };
  }
  if (source.discord) {
    result.discord = { ...result.discord, ...source.discord };
  }
  if (source.log) {
    result.log = { ...result.log, ...source.log };
  }
  if (source.events) {
    result.events = { ...result.events, ...source.events };
  }

  return result;
}

/**
 * Load and parse config file safely
 * @param filePath path to config file
 * @returns parsed config or null if file doesn't exist or is invalid
 */
function loadConfigFile(filePath: string): Partial<EverynotifyConfig> | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    return parsed as Partial<EverynotifyConfig>;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(
      `[EveryNotify] Failed to load config from ${filePath}: ${errorMsg}`,
    );
    return null;
  }
}

/**
 * Load configuration from global and project scopes
 * Merge order: defaults ← global ← project (project wins)
 * @param directory project directory
 * @returns merged EverynotifyConfig
 */
export function loadConfig(directory: string): EverynotifyConfig {
  // Start with defaults
  let config = { ...DEFAULT_CONFIG };

  // Load and merge global config
  const globalPath = getConfigPath("global", directory);
  const globalConfig = loadConfigFile(globalPath);
  if (globalConfig) {
    config = deepMerge(config, globalConfig);
  }

  // Load and merge project config
  const projectPath = getConfigPath("project", directory);
  const projectConfig = loadConfigFile(projectPath);
  if (projectConfig) {
    config = deepMerge(config, projectConfig);
  }

  // Check if all services are disabled
  const allDisabled =
    !config.pushover.enabled &&
    !config.telegram.enabled &&
    !config.slack.enabled &&
    !config.discord.enabled;

  if (allDisabled) {
    console.error(
      "[EveryNotify] No services configured. Enable services in .everynotify.json",
    );
  }

  return config;
}
