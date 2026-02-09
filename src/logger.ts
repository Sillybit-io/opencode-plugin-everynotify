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

export interface FsDeps {
  mkdirSync: typeof fs.mkdirSync;
  appendFileSync: typeof fs.appendFileSync;
  statSync: typeof fs.statSync;
  renameSync: typeof fs.renameSync;
  readdirSync: typeof fs.readdirSync;
  unlinkSync: typeof fs.unlinkSync;
}

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
 * @param fsDeps - Optional fs operations override for testing
 * @returns Logger instance (no-op if logging disabled)
 */
export function createLogger(
  config: EverynotifyConfig,
  fsDeps?: Partial<FsDeps>,
): Logger {
  if (!config.log.enabled) {
    return { error: () => {}, warn: () => {} };
  }

  const _fs: FsDeps = {
    mkdirSync: fsDeps?.mkdirSync ?? fs.mkdirSync,
    appendFileSync: fsDeps?.appendFileSync ?? fs.appendFileSync,
    statSync: fsDeps?.statSync ?? fs.statSync,
    renameSync: fsDeps?.renameSync ?? fs.renameSync,
    readdirSync: fsDeps?.readdirSync ?? fs.readdirSync,
    unlinkSync: fsDeps?.unlinkSync ?? fs.unlinkSync,
  };

  const logFilePath = getLogFilePath();
  const logDir = path.dirname(logFilePath);
  const level = config.log.level || "warn";

  let disabled = false;
  try {
    _fs.mkdirSync(logDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[EveryNotify] Failed to create log directory: ${message}`);
    disabled = true;
  }

  function rotateIfNeeded(): void {
    try {
      const stat = _fs.statSync(logFilePath);
      const ageMs = Date.now() - stat.mtime.getTime();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

      if (ageMs > sevenDaysMs) {
        const mtimeDate = stat.mtime.toISOString().split("T")[0];
        const rotatedPath = `${logFilePath}.${mtimeDate}`;
        _fs.renameSync(logFilePath, rotatedPath);
        cleanupRotatedFiles();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[EveryNotify] Rotation check failed: ${message}`);
      }
    }
  }

  function cleanupRotatedFiles(): void {
    try {
      const dir = path.dirname(logFilePath);
      const baseName = path.basename(logFilePath);

      const files = (_fs.readdirSync(dir) as string[])
        .filter(
          (f) => f.startsWith(`${baseName}.`) && /\d{4}-\d{2}-\d{2}$/.test(f),
        )
        .sort();

      while (files.length > 4) {
        const oldest = files.shift()!;
        _fs.unlinkSync(path.join(dir, oldest));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[EveryNotify] Cleanup failed: ${message}`);
    }
  }

  function writeLog(levelStr: string, msg: string): void {
    if (disabled) return;

    try {
      rotateIfNeeded();
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] [${levelStr}] [EveryNotify] ${msg}\n`;
      _fs.appendFileSync(logFilePath, line, "utf-8");
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
      if (level === "error") return;
      writeLog("WARN", msg);
    },
  };
}
