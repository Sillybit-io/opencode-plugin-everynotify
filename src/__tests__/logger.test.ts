/// <reference types="bun" />
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createLogger, _fsOps } from "../logger";
import type { EverynotifyConfig } from "../types";

describe("Logger", () => {
  let tempDir: string;
  let mockConfig: EverynotifyConfig;
  let consoleErrorSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "logger-test-"));

    mockConfig = {
      pushover: { enabled: false, token: "", userKey: "" },
      telegram: { enabled: false, botToken: "", chatId: "" },
      slack: { enabled: false, webhookUrl: "" },
      discord: { enabled: false, webhookUrl: "" },
      log: { enabled: true, level: "warn" },
      events: {
        complete: true,
        subagent_complete: true,
        error: true,
        permission: true,
        question: true,
      },
    };

    consoleErrorSpy = mock(() => {});
    console.error = consoleErrorSpy as any;
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.error = (consoleErrorSpy.mock as any).restore?.() || (() => {});
  });

  describe("No-op when disabled", () => {
    it("should not write to file when log.enabled is false", () => {
      mockConfig.log.enabled = false;
      const appendSpy = spyOn(_fsOps, "appendFileSync");

      const logger = createLogger(mockConfig);
      logger.error("test error");
      logger.warn("test warning");

      expect(appendSpy).not.toHaveBeenCalled();
      appendSpy.mockRestore();
    });

    it("should not create log directory when disabled", () => {
      mockConfig.log.enabled = false;
      const mkdirSpy = spyOn(_fsOps, "mkdirSync");

      const logger = createLogger(mockConfig);
      logger.error("test");

      expect(mkdirSpy).not.toHaveBeenCalled();
      mkdirSpy.mockRestore();
    });
  });

  describe("Creates log directory if missing", () => {
    it("should create log directory with recursive option", () => {
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);
      logger.error("test");

      expect(mkdirSpy).toHaveBeenCalledWith(
        expect.stringContaining(".config/opencode"),
        { recursive: true },
      );

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });

    it("should handle directory creation failure gracefully", () => {
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(() => {
        throw new Error("Permission denied");
      });

      const logger = createLogger(mockConfig);
      logger.error("test");

      expect(consoleErrorSpy).toHaveBeenCalled();
      const [message] = consoleErrorSpy.mock.calls[0];
      expect(message).toContain("[EveryNotify] Failed to create log directory");
      expect(message).toContain("Permission denied");

      mkdirSpy.mockRestore();
    });
  });

  describe("Writes error entry with correct format", () => {
    it("should write error with ISO-8601 timestamp and correct format", () => {
      const logPath = path.join(tempDir, ".everynotify.log");
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);
      logger.error("test error message");

      expect(appendSpy).toHaveBeenCalledTimes(1);
      const [, content] = appendSpy.mock.calls[0];

      const regex =
        /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\] \[EveryNotify\] test error message\n$/;
      expect(regex.test(content as string)).toBe(true);

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });

    it("should append multiple error entries", () => {
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);
      logger.error("first error");
      logger.error("second error");

      expect(appendSpy).toHaveBeenCalledTimes(2);
      expect(appendSpy.mock.calls[0][1]).toContain(
        "[ERROR] [EveryNotify] first error",
      );
      expect(appendSpy.mock.calls[1][1]).toContain(
        "[ERROR] [EveryNotify] second error",
      );

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });
  });

  describe("Writes warn entry with correct format", () => {
    it("should write warn with ISO-8601 timestamp and correct format", () => {
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);
      logger.warn("test warning message");

      expect(appendSpy).toHaveBeenCalledTimes(1);
      const [, content] = appendSpy.mock.calls[0];

      const regex =
        /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[WARN\] \[EveryNotify\] test warning message\n$/;
      expect(regex.test(content as string)).toBe(true);

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });
  });

  describe("Level filtering (error-only)", () => {
    it("should ignore warn() calls when level is error", () => {
      mockConfig.log.level = "error";
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);
      logger.warn("this should be ignored");
      logger.error("this should be logged");

      expect(appendSpy).toHaveBeenCalledTimes(1);
      expect(appendSpy.mock.calls[0][1]).toContain(
        "[ERROR] [EveryNotify] this should be logged",
      );
      expect(appendSpy.mock.calls[0][1]).not.toContain(
        "this should be ignored",
      );

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });

    it("should only log error when level is error", () => {
      mockConfig.log.level = "error";
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);
      logger.warn("warning 1");
      logger.error("error 1");
      logger.warn("warning 2");
      logger.error("error 2");

      expect(appendSpy).toHaveBeenCalledTimes(2);
      expect(
        appendSpy.mock.calls.every((c) => String(c[1]).includes("[ERROR]")),
      ).toBe(true);

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });
  });

  describe("Level filtering (warn)", () => {
    it("should log both error and warn when level is warn", () => {
      mockConfig.log.level = "warn";
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);
      logger.error("error message");
      logger.warn("warning message");

      expect(appendSpy).toHaveBeenCalledTimes(2);
      expect(appendSpy.mock.calls[0][1]).toContain(
        "[ERROR] [EveryNotify] error message",
      );
      expect(appendSpy.mock.calls[1][1]).toContain(
        "[WARN] [EveryNotify] warning message",
      );

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });

    it("should default to warn level when not specified", () => {
      mockConfig.log.level = undefined;
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);
      logger.error("error");
      logger.warn("warning");

      expect(appendSpy).toHaveBeenCalledTimes(2);

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });
  });

  describe("Rotation renames old file", () => {
    it("should rename file when older than 7 days", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(eightDaysAgo);

      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameSpy = spyOn(_fsOps, "renameSync").mockImplementation(
        () => {},
      );
      const readdirSpy = spyOn(_fsOps, "readdirSync").mockImplementation(
        () => [],
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );

      const logger = createLogger(mockConfig);
      logger.error("new entry");

      expect(renameSpy).toHaveBeenCalledTimes(1);
      const [oldPath, newPath] = renameSpy.mock.calls[0];
      expect(oldPath).toContain(".everynotify.log");
      expect(newPath).toMatch(/\.everynotify\.log\.\d{4}-\d{2}-\d{2}$/);

      mkdirSpy.mockRestore();
      statSpy.mockRestore();
      renameSpy.mockRestore();
      readdirSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it("should not rotate file when younger than 7 days", () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const recentDate = new Date(threeDaysAgo);

      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(
        () =>
          ({
            mtime: recentDate,
            isFile: () => true,
          }) as any,
      );
      const renameSpy = spyOn(_fsOps, "renameSync").mockImplementation(
        () => {},
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );

      const logger = createLogger(mockConfig);
      logger.error("new entry");

      expect(renameSpy).not.toHaveBeenCalled();

      mkdirSpy.mockRestore();
      statSpy.mockRestore();
      renameSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it("should use mtime date for rotated filename", () => {
      const specificDate = new Date("2026-01-15T12:00:00.000Z");

      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(
        () =>
          ({
            mtime: specificDate,
            isFile: () => true,
          }) as any,
      );
      const renameSpy = spyOn(_fsOps, "renameSync").mockImplementation(
        () => {},
      );
      const readdirSpy = spyOn(_fsOps, "readdirSync").mockImplementation(
        () => [],
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );

      const logger = createLogger(mockConfig);
      logger.error("new");

      expect(renameSpy).toHaveBeenCalledTimes(1);
      const [, newPath] = renameSpy.mock.calls[0];
      expect(newPath).toContain("2026-01-15");

      mkdirSpy.mockRestore();
      statSpy.mockRestore();
      renameSpy.mockRestore();
      readdirSpy.mockRestore();
      appendSpy.mockRestore();
    });
  });

  describe("Cleanup keeps max 4 files", () => {
    it("should delete oldest files when more than 4 rotated files exist", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(eightDaysAgo);

      const rotatedFiles = [
        ".everynotify.log.2026-01-01",
        ".everynotify.log.2026-01-02",
        ".everynotify.log.2026-01-03",
        ".everynotify.log.2026-01-04",
        ".everynotify.log.2026-01-05",
      ];

      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameSpy = spyOn(_fsOps, "renameSync").mockImplementation(
        () => {},
      );
      const readdirSpy = spyOn(_fsOps, "readdirSync").mockImplementation(
        () => rotatedFiles as any,
      );
      const unlinkSpy = spyOn(_fsOps, "unlinkSync").mockImplementation(
        () => {},
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );

      const logger = createLogger(mockConfig);
      logger.error("new");

      expect(unlinkSpy).toHaveBeenCalledTimes(1);
      const [deletedPath] = unlinkSpy.mock.calls[0];
      expect(deletedPath).toContain("2026-01-01");

      mkdirSpy.mockRestore();
      statSpy.mockRestore();
      renameSpy.mockRestore();
      readdirSpy.mockRestore();
      unlinkSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it("should keep all files when 4 or fewer rotated files exist", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(eightDaysAgo);

      const rotatedFiles = [
        ".everynotify.log.2026-01-01",
        ".everynotify.log.2026-01-02",
        ".everynotify.log.2026-01-03",
      ];

      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameSpy = spyOn(_fsOps, "renameSync").mockImplementation(
        () => {},
      );
      const readdirSpy = spyOn(_fsOps, "readdirSync").mockImplementation(
        () => rotatedFiles as any,
      );
      const unlinkSpy = spyOn(_fsOps, "unlinkSync").mockImplementation(
        () => {},
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );

      const logger = createLogger(mockConfig);
      logger.error("new");

      expect(unlinkSpy).not.toHaveBeenCalled();

      mkdirSpy.mockRestore();
      statSpy.mockRestore();
      renameSpy.mockRestore();
      readdirSpy.mockRestore();
      unlinkSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it("should delete multiple oldest files when needed", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(eightDaysAgo);

      const rotatedFiles = [
        ".everynotify.log.2026-01-01",
        ".everynotify.log.2026-01-02",
        ".everynotify.log.2026-01-03",
        ".everynotify.log.2026-01-04",
        ".everynotify.log.2026-01-05",
        ".everynotify.log.2026-01-06",
        ".everynotify.log.2026-01-07",
      ];

      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameSpy = spyOn(_fsOps, "renameSync").mockImplementation(
        () => {},
      );
      const readdirSpy = spyOn(_fsOps, "readdirSync").mockImplementation(
        () => rotatedFiles as any,
      );
      const unlinkSpy = spyOn(_fsOps, "unlinkSync").mockImplementation(
        () => {},
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );

      const logger = createLogger(mockConfig);
      logger.error("new");

      expect(unlinkSpy).toHaveBeenCalledTimes(3);
      expect(unlinkSpy.mock.calls[0][0]).toContain("2026-01-01");
      expect(unlinkSpy.mock.calls[1][0]).toContain("2026-01-02");
      expect(unlinkSpy.mock.calls[2][0]).toContain("2026-01-03");

      mkdirSpy.mockRestore();
      statSpy.mockRestore();
      renameSpy.mockRestore();
      readdirSpy.mockRestore();
      unlinkSpy.mockRestore();
      appendSpy.mockRestore();
    });
  });

  describe("Never throws on write failure", () => {
    it("should catch and log write errors without throwing", () => {
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {
          throw new Error("Disk full");
        },
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);

      expect(() => logger.error("test")).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      const calls = consoleErrorSpy.mock.calls;
      const writeErrorCall = calls.find((c) =>
        c[0].includes("[EveryNotify] Log write failed"),
      );
      expect(writeErrorCall).toBeTruthy();
      expect(writeErrorCall![0]).toContain("Disk full");

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });

    it("should handle non-Error exceptions gracefully", () => {
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {
          throw "String error";
        },
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);

      expect(() => logger.error("test")).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });

    it("should continue logging after write failure", () => {
      let callCount = 0;
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {
          callCount++;
          if (callCount === 1) {
            throw new Error("Temporary failure");
          }
        },
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig);
      logger.error("first");
      logger.error("second");

      expect(appendSpy).toHaveBeenCalledTimes(2);

      mkdirSpy.mockRestore();
      appendSpy.mockRestore();
      statSpy.mockRestore();
    });
  });

  describe("Never throws on rotation failure", () => {
    it("should catch and log rotation errors without throwing", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(eightDaysAgo);

      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameSpy = spyOn(_fsOps, "renameSync").mockImplementation(() => {
        throw new Error("Permission denied");
      });
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );

      const logger = createLogger(mockConfig);

      expect(() => logger.error("new")).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      const calls = consoleErrorSpy.mock.calls;
      const rotationErrorCall = calls.find((c) =>
        c[0].includes("[EveryNotify] Rotation check failed"),
      );
      expect(rotationErrorCall).toBeTruthy();
      expect(rotationErrorCall![0]).toContain("Permission denied");

      mkdirSpy.mockRestore();
      statSpy.mockRestore();
      renameSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it("should catch and log cleanup errors without throwing", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(eightDaysAgo);

      const rotatedFiles = [
        ".everynotify.log.2026-01-01",
        ".everynotify.log.2026-01-02",
        ".everynotify.log.2026-01-03",
        ".everynotify.log.2026-01-04",
        ".everynotify.log.2026-01-05",
      ];

      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameSpy = spyOn(_fsOps, "renameSync").mockImplementation(
        () => {},
      );
      const readdirSpy = spyOn(_fsOps, "readdirSync").mockImplementation(
        () => rotatedFiles as any,
      );
      const unlinkSpy = spyOn(_fsOps, "unlinkSync").mockImplementation(() => {
        throw new Error("Cannot delete file");
      });
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );

      const logger = createLogger(mockConfig);

      expect(() => logger.error("new")).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      const calls = consoleErrorSpy.mock.calls;
      const cleanupErrorCall = calls.find((c) =>
        c[0].includes("[EveryNotify] Cleanup failed"),
      );
      expect(cleanupErrorCall).toBeTruthy();
      expect(cleanupErrorCall![0]).toContain("Cannot delete file");

      mkdirSpy.mockRestore();
      statSpy.mockRestore();
      renameSpy.mockRestore();
      readdirSpy.mockRestore();
      unlinkSpy.mockRestore();
      appendSpy.mockRestore();
    });

    it("should ignore ENOENT errors during rotation check", () => {
      const mkdirSpy = spyOn(_fsOps, "mkdirSync").mockImplementation(
        () => undefined,
      );
      const statSpy = spyOn(_fsOps, "statSync").mockImplementation(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });
      const appendSpy = spyOn(_fsOps, "appendFileSync").mockImplementation(
        () => {},
      );

      const logger = createLogger(mockConfig);

      expect(() => logger.error("first entry")).not.toThrow();

      const calls = consoleErrorSpy.mock.calls;
      const enoentCall = calls.find((c) => c[0].includes("ENOENT"));
      expect(enoentCall).toBeFalsy();

      mkdirSpy.mockRestore();
      statSpy.mockRestore();
      appendSpy.mockRestore();
    });
  });
});
