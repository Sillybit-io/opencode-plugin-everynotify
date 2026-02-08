/**
 * EveryNotify Plugin — File-Based Logger
 *
 * Provides a simple file-based logger with 7-day rotation.
 * Writes to ~/.config/opencode/.everynotify.log with automatic cleanup.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { EverynotifyConfig } from "./types";

/**
 * Logger interface with error and warn methods
 */
export interface Logger {
  error(msg: string): void;
  warn(msg: string): void;
}

/**
 * Returns the absolute path to the log file
 * @returns Log file path: ~/.config/opencode/.everynotify.log
 */
export function getLogFilePath(): string {
  return path.join(os.homedir(), ".config", "opencode", ".everynotify.log");
}

/**
 * Creates a logger instance based on configuration
 * @param config - EveryNotify configuration object
 * @returns Logger instance (no-op if logging disabled)
 */
export function createLogger(config: EverynotifyConfig): Logger {
  if (!config.log.enabled) {
    return { error: () => {}, warn: () => {} };
  }

  const logFilePath = getLogFilePath();
  const logDir = path.dirname(logFilePath);
  const level = config.log.level || "warn";

  // Try to create log directory
  let disabled = false;
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EveryNotify] Failed to create log directory: ${message}`);
    disabled = true;
  }

  /**
   * Writes a log entry to the file with rotation and cleanup
   */
  function writeLog(levelStr: string, msg: string): void {
    if (disabled) return;

    try {
      // Check if rotation is needed
      rotateIfNeeded(logFilePath);

      // Format: [ISO-8601] [LEVEL] [EveryNotify] message
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] [${levelStr}] [EveryNotify] ${msg}\n`;

      fs.appendFileSync(logFilePath, line, "utf-8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[EveryNotify] Log write failed: ${message}`);
    }
  }

  return {
    error(msg: string): void {
      writeLog("ERROR", msg);
    },
    warn(msg: string): void {
      if (level === "error") return; // Skip warn if level is error-only
      writeLog("WARN", msg);
    },
  };
}

/**
 * Checks file mtime and rotates if older than 7 days
 * @param logFilePath - Path to the log file
 */
function rotateIfNeeded(logFilePath: string): void {
  try {
    const stat = fs.statSync(logFilePath);
    const ageMs = Date.now() - stat.mtime.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    if (ageMs > sevenDaysMs) {
      // Rotate using mtime date (not current date)
      const mtimeDate = stat.mtime.toISOString().split("T")[0];
      const rotatedPath = `${logFilePath}.${mtimeDate}`;

      fs.renameSync(logFilePath, rotatedPath);

      // Clean up old rotated files
      cleanupRotatedFiles(logFilePath);
    }
  } catch (error) {
    // File doesn't exist yet or stat failed — skip rotation
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[EveryNotify] Rotation check failed: ${message}`);
    }
  }
}

/**
 * Keeps max 4 rotated files, deletes oldest
 * @param logFilePath - Path to the log file
 */
function cleanupRotatedFiles(logFilePath: string): void {
  try {
    const dir = path.dirname(logFilePath);
    const baseName = path.basename(logFilePath);

    // Find all rotated files matching .everynotify.log.YYYY-MM-DD
    const files = fs
      .readdirSync(dir)
      .filter(
        (f) => f.startsWith(`${baseName}.`) && /\d{4}-\d{2}-\d{2}$/.test(f),
      )
      .sort(); // Lexical sort (YYYY-MM-DD)

    // Delete oldest files if count > 4
    while (files.length > 4) {
      const oldest = files.shift()!;
      fs.unlinkSync(path.join(dir, oldest));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EveryNotify] Cleanup failed: ${message}`);
  }
}
