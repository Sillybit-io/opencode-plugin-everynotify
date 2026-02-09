/// <reference types="bun" />
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { EverynotifyConfig } from "../types";
import type { FsDeps } from "../logger";

let createLogger: typeof import("../logger").createLogger;

describe("Logger", () => {
  let tempDir: string;
  let mockConfig: EverynotifyConfig;
  let consoleErrorSpy: ReturnType<typeof mock>;

  beforeAll(async () => {
    // Use query string to bypass mock.module registry from integration tests
    const mod = await import("../logger" + "?real");
    createLogger = mod.createLogger;
  });

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
      const appendMock = mock(() => {});

      const logger = createLogger(mockConfig, {
        appendFileSync: appendMock as any,
      });
      logger.error("test error");
      logger.warn("test warning");

      expect(appendMock).not.toHaveBeenCalled();
    });

    it("should not create log directory when disabled", () => {
      mockConfig.log.enabled = false;
      const mkdirMock = mock(() => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
      });
      logger.error("test");

      expect(mkdirMock).not.toHaveBeenCalled();
    });
  });

  describe("Creates log directory if missing", () => {
    it("should create log directory with recursive option", () => {
      const mkdirMock = mock(() => undefined);
      const appendMock = mock(() => {});
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });
      logger.error("test");

      expect(mkdirMock).toHaveBeenCalledWith(
        expect.stringContaining(".config/opencode"),
        { recursive: true },
      );
    });

    it("should handle directory creation failure gracefully", () => {
      const mkdirMock = mock(() => {
        throw new Error("Permission denied");
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
      });
      logger.error("test");

      expect(consoleErrorSpy).toHaveBeenCalled();
      const [message] = consoleErrorSpy.mock.calls[0];
      expect(message).toContain("[EveryNotify] Failed to create log directory");
      expect(message).toContain("Permission denied");
    });
  });

  describe("Writes error entry with correct format", () => {
    it("should write error with ISO-8601 timestamp and correct format", () => {
      const logPath = path.join(tempDir, ".everynotify.log");
      const mkdirMock = mock(() => undefined);
      const appendMock = mock((_path: string, content: string) => {});
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });
      logger.error("test error message");

      expect(appendMock).toHaveBeenCalledTimes(1);
      const content = appendMock.mock.calls[0][1];

      const regex =
        /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[ERROR\] \[EveryNotify\] test error message\n$/;
      expect(regex.test(content as string)).toBe(true);
    });

    it("should append multiple error entries", () => {
      const mkdirMock = mock(() => undefined);
      const appendMock = mock((_path: string, content: string) => {});
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });
      logger.error("first error");
      logger.error("second error");

      expect(appendMock).toHaveBeenCalledTimes(2);
      expect(String(appendMock.mock.calls[0][1])).toContain(
        "[ERROR] [EveryNotify] first error",
      );
      expect(String(appendMock.mock.calls[1][1])).toContain(
        "[ERROR] [EveryNotify] second error",
      );
    });
  });

  describe("Writes warn entry with correct format", () => {
    it("should write warn with ISO-8601 timestamp and correct format", () => {
      const mkdirMock = mock(() => undefined);
      const appendMock = mock((_path: string, content: string) => {});
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });
      logger.warn("test warning message");

      expect(appendMock).toHaveBeenCalledTimes(1);
      const content = appendMock.mock.calls[0][1];

      const regex =
        /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[WARN\] \[EveryNotify\] test warning message\n$/;
      expect(regex.test(content as string)).toBe(true);
    });
  });

  describe("Level filtering (error-only)", () => {
    it("should ignore warn() calls when level is error", () => {
      mockConfig.log.level = "error";
      const mkdirMock = mock(() => undefined);
      const appendMock = mock((_path: string, content: string) => {});
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });
      logger.warn("this should be ignored");
      logger.error("this should be logged");

      expect(appendMock).toHaveBeenCalledTimes(1);
      expect(String(appendMock.mock.calls[0][1])).toContain(
        "[ERROR] [EveryNotify] this should be logged",
      );
      expect(String(appendMock.mock.calls[0][1])).not.toContain(
        "this should be ignored",
      );
    });

    it("should only log error when level is error", () => {
      mockConfig.log.level = "error";
      const mkdirMock = mock(() => undefined);
      const appendMock = mock((_path: string, content: string) => {});
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });
      logger.warn("warning 1");
      logger.error("error 1");
      logger.warn("warning 2");
      logger.error("error 2");

      expect(appendMock).toHaveBeenCalledTimes(2);
      expect(
        appendMock.mock.calls.every((c) => String(c[1]).includes("[ERROR]")),
      ).toBe(true);
    });
  });

  describe("Level filtering (warn)", () => {
    it("should log both error and warn when level is warn", () => {
      mockConfig.log.level = "warn";
      const mkdirMock = mock(() => undefined);
      const appendMock = mock((_path: string, content: string) => {});
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });
      logger.error("error message");
      logger.warn("warning message");

      expect(appendMock).toHaveBeenCalledTimes(2);
      expect(String(appendMock.mock.calls[0][1])).toContain(
        "[ERROR] [EveryNotify] error message",
      );
      expect(String(appendMock.mock.calls[1][1])).toContain(
        "[WARN] [EveryNotify] warning message",
      );
    });

    it("should default to warn level when not specified", () => {
      mockConfig.log.level = undefined;
      const mkdirMock = mock(() => undefined);
      const appendMock = mock((_path: string, content: string) => {});
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });
      logger.error("error");
      logger.warn("warning");

      expect(appendMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("Rotation renames old file", () => {
    it("should rename file when older than 7 days", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(eightDaysAgo);

      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const statMock = mock(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameMock = mock((_oldPath: string, _newPath: string) => {});
      const readdirMock = mock((_path: string) => []);
      const appendMock = mock((_path: string, _content: string) => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        statSync: statMock as any,
        renameSync: renameMock as any,
        readdirSync: readdirMock as any,
        appendFileSync: appendMock as any,
      });
      logger.error("new entry");

      expect(renameMock).toHaveBeenCalledTimes(1);
      const oldPath = renameMock.mock.calls[0][0];
      const newPath = renameMock.mock.calls[0][1];
      expect(String(oldPath)).toContain(".everynotify.log");
      expect(String(newPath)).toMatch(/\.everynotify\.log\.\d{4}-\d{2}-\d{2}$/);
    });

    it("should not rotate file when younger than 7 days", () => {
      const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
      const recentDate = new Date(threeDaysAgo);

      const mkdirMock = mock(() => undefined);
      const statMock = mock(
        () =>
          ({
            mtime: recentDate,
            isFile: () => true,
          }) as any,
      );
      const renameMock = mock(() => {});
      const appendMock = mock((_path: string, content: string) => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        statSync: statMock as any,
        renameSync: renameMock as any,
        appendFileSync: appendMock as any,
      });
      logger.error("new entry");

      expect(renameMock).not.toHaveBeenCalled();
    });

    it("should use mtime date for rotated filename", () => {
      const specificDate = new Date("2026-01-15T12:00:00.000Z");

      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const statMock = mock(
        () =>
          ({
            mtime: specificDate,
            isFile: () => true,
          }) as any,
      );
      const renameMock = mock((_oldPath: string, _newPath: string) => {});
      const readdirMock = mock((_path: string) => []);
      const appendMock = mock((_path: string, _content: string) => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        statSync: statMock as any,
        renameSync: renameMock as any,
        readdirSync: readdirMock as any,
        appendFileSync: appendMock as any,
      });
      logger.error("new");

      expect(renameMock).toHaveBeenCalledTimes(1);
      const newPath = renameMock.mock.calls[0][1];
      expect(String(newPath)).toContain("2026-01-15");
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

      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const statMock = mock(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameMock = mock((_oldPath: string, _newPath: string) => {});
      const readdirMock = mock((_path: string) => rotatedFiles as any);
      const unlinkMock = mock((_path: string) => {});
      const appendMock = mock((_path: string, _content: string) => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        statSync: statMock as any,
        renameSync: renameMock as any,
        readdirSync: readdirMock as any,
        unlinkSync: unlinkMock as any,
        appendFileSync: appendMock as any,
      });
      logger.error("new");

      expect(unlinkMock).toHaveBeenCalledTimes(1);
      const deletedPath = unlinkMock.mock.calls[0][0];
      expect(String(deletedPath)).toContain("2026-01-01");
    });

    it("should keep all files when 4 or fewer rotated files exist", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(eightDaysAgo);

      const rotatedFiles = [
        ".everynotify.log.2026-01-01",
        ".everynotify.log.2026-01-02",
        ".everynotify.log.2026-01-03",
      ];

      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const statMock = mock(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameMock = mock((_oldPath: string, _newPath: string) => {});
      const readdirMock = mock((_path: string) => rotatedFiles as any);
      const unlinkMock = mock((_path: string) => {});
      const appendMock = mock((_path: string, _content: string) => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        statSync: statMock as any,
        renameSync: renameMock as any,
        readdirSync: readdirMock as any,
        unlinkSync: unlinkMock as any,
        appendFileSync: appendMock as any,
      });
      logger.error("new");

      expect(unlinkMock).not.toHaveBeenCalled();
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

      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const statMock = mock(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameMock = mock((_oldPath: string, _newPath: string) => {});
      const readdirMock = mock((_path: string) => rotatedFiles as any);
      const unlinkMock = mock((_path: string) => {});
      const appendMock = mock((_path: string, _content: string) => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        statSync: statMock as any,
        renameSync: renameMock as any,
        readdirSync: readdirMock as any,
        unlinkSync: unlinkMock as any,
        appendFileSync: appendMock as any,
      });
      logger.error("new");

      expect(unlinkMock).toHaveBeenCalledTimes(3);
      expect(String(unlinkMock.mock.calls[0][0])).toContain("2026-01-01");
      expect(String(unlinkMock.mock.calls[1][0])).toContain("2026-01-02");
      expect(String(unlinkMock.mock.calls[2][0])).toContain("2026-01-03");
    });
  });

  describe("Never throws on write failure", () => {
    it("should catch and log write errors without throwing", () => {
      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const appendMock = mock((_path: string, _content: string) => {
        throw new Error("Disk full");
      });
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });

      expect(() => logger.error("test")).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      const calls = consoleErrorSpy.mock.calls;
      const writeErrorCall = calls.find((c) =>
        String(c[0]).includes("[EveryNotify] Log write failed"),
      );
      expect(writeErrorCall).toBeTruthy();
      expect(String(writeErrorCall![0])).toContain("Disk full");
    });

    it("should handle non-Error exceptions gracefully", () => {
      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const appendMock = mock((_path: string, _content: string) => {
        throw "String error";
      });
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });

      expect(() => logger.error("test")).not.toThrow();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should continue logging after write failure", () => {
      let callCount = 0;
      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const appendMock = mock((_path: string, _content: string) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Temporary failure");
        }
      });
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        appendFileSync: appendMock as any,
        statSync: statMock as any,
      });
      logger.error("first");
      logger.error("second");

      expect(appendMock).toHaveBeenCalledTimes(2);
    });
  });

  describe("Never throws on rotation failure", () => {
    it("should catch and log rotation errors without throwing", () => {
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      const oldDate = new Date(eightDaysAgo);

      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const statMock = mock(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameMock = mock((_oldPath: string, _newPath: string) => {
        throw new Error("Permission denied");
      });
      const appendMock = mock((_path: string, _content: string) => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        statSync: statMock as any,
        renameSync: renameMock as any,
        appendFileSync: appendMock as any,
      });

      expect(() => logger.error("new")).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      const calls = consoleErrorSpy.mock.calls;
      const rotationErrorCall = calls.find((c) =>
        String(c[0]).includes("[EveryNotify] Rotation check failed"),
      );
      expect(rotationErrorCall).toBeTruthy();
      expect(String(rotationErrorCall![0])).toContain("Permission denied");
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

      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const statMock = mock(
        () =>
          ({
            mtime: oldDate,
            isFile: () => true,
          }) as any,
      );
      const renameMock = mock((_oldPath: string, _newPath: string) => {});
      const readdirMock = mock((_path: string) => rotatedFiles as any);
      const unlinkMock = mock((_path: string) => {
        throw new Error("Cannot delete file");
      });
      const appendMock = mock((_path: string, _content: string) => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        statSync: statMock as any,
        renameSync: renameMock as any,
        readdirSync: readdirMock as any,
        unlinkSync: unlinkMock as any,
        appendFileSync: appendMock as any,
      });

      expect(() => logger.error("new")).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      const calls = consoleErrorSpy.mock.calls;
      const cleanupErrorCall = calls.find((c) =>
        String(c[0]).includes("[EveryNotify] Cleanup failed"),
      );
      expect(cleanupErrorCall).toBeTruthy();
      expect(String(cleanupErrorCall![0])).toContain("Cannot delete file");
    });

    it("should ignore ENOENT errors during rotation check", () => {
      const mkdirMock = mock((_path: string, _opts: any) => undefined);
      const statMock = mock(() => {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });
      const appendMock = mock((_path: string, _content: string) => {});

      const logger = createLogger(mockConfig, {
        mkdirSync: mkdirMock as any,
        statSync: statMock as any,
        appendFileSync: appendMock as any,
      });

      expect(() => logger.error("first entry")).not.toThrow();

      const calls = consoleErrorSpy.mock.calls;
      const enoentCall = calls.find((c) => String(c[0]).includes("ENOENT"));
      expect(enoentCall).toBeFalsy();
    });
  });
});
