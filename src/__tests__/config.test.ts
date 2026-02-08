/// <reference types="bun" />
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  mock,
  spyOn,
} from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { DEFAULT_CONFIG, getConfigPath, loadConfig } from "../config";
import type { EverynotifyConfig } from "../types";

const mockConsoleError = mock(() => {});
let originalConsoleError: typeof console.error;

/**
 * Fake homedir used by all tests in this file.
 * Prevents tests from reading/writing the real ~/.config/opencode/.everynotify.json
 */
let fakeHomeDir: string;
let homedirSpy: ReturnType<typeof spyOn>;

describe("Config Loader", () => {
  beforeAll(() => {
    fakeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-home-"));
    homedirSpy = spyOn(os, "homedir").mockReturnValue(fakeHomeDir);
  });

  afterAll(() => {
    homedirSpy.mockRestore();
    fs.rmSync(fakeHomeDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    mockConsoleError.mockClear();
    originalConsoleError = console.error;
    console.error = mockConsoleError as any;
  });

  afterEach(() => {
    console.error = originalConsoleError;
    const fakeGlobalConfig = path.join(
      fakeHomeDir,
      ".config",
      "opencode",
      ".everynotify.json",
    );
    if (fs.existsSync(fakeGlobalConfig)) {
      fs.rmSync(fakeGlobalConfig, { force: true });
    }
  });

  describe("DEFAULT_CONFIG", () => {
    it("should have all services disabled", () => {
      expect(DEFAULT_CONFIG.pushover.enabled).toBe(false);
      expect(DEFAULT_CONFIG.telegram.enabled).toBe(false);
      expect(DEFAULT_CONFIG.slack.enabled).toBe(false);
      expect(DEFAULT_CONFIG.discord.enabled).toBe(false);
    });

    it("should have empty credentials", () => {
      expect(DEFAULT_CONFIG.pushover.token).toBe("");
      expect(DEFAULT_CONFIG.pushover.userKey).toBe("");
      expect(DEFAULT_CONFIG.telegram.botToken).toBe("");
      expect(DEFAULT_CONFIG.telegram.chatId).toBe("");
      expect(DEFAULT_CONFIG.slack.webhookUrl).toBe("");
      expect(DEFAULT_CONFIG.discord.webhookUrl).toBe("");
    });
  });

  describe("getConfigPath", () => {
    it("should return global config path", () => {
      const globalPath = getConfigPath("global", "/tmp/project");
      expect(globalPath).toContain(".config");
      expect(globalPath).toContain("opencode");
      expect(globalPath).toContain(".everynotify.json");
      expect(globalPath).toContain(os.homedir());
    });

    it("should return project config path", () => {
      const projectPath = getConfigPath("project", "/tmp/project");
      expect(projectPath).toBe(
        path.join("/tmp/project", ".opencode", ".everynotify.json"),
      );
    });
  });

  describe("loadConfig", () => {
    it("should return defaults when no config files exist", () => {
      const config = loadConfig("/nonexistent/directory/12345");
      expect(config.pushover.enabled).toBe(false);
      expect(config.telegram.enabled).toBe(false);
      expect(config.slack.enabled).toBe(false);
      expect(config.discord.enabled).toBe(false);
    });

    it("should log warning when all services disabled", () => {
      const originalError = console.error;
      const logs: string[] = [];
      console.error = (msg: string) => logs.push(msg);

      try {
        loadConfig("/nonexistent/directory/12345");

        expect(
          logs.some((log) =>
            log.includes("[EveryNotify] No services configured"),
          ),
        ).toBe(true);
      } finally {
        console.error = originalError;
      }
    });

    it("should merge partial global config with defaults", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const globalConfigDir = path.join(os.homedir(), ".config", "opencode");

      try {
        fs.mkdirSync(globalConfigDir, { recursive: true });

        const globalConfig: Partial<EverynotifyConfig> = {
          pushover: {
            enabled: true,
            token: "global-token",
            userKey: "global-user",
          },
        };
        fs.writeFileSync(
          path.join(globalConfigDir, ".everynotify.json"),
          JSON.stringify(globalConfig),
        );

        const config = loadConfig(tempDir);

        expect(config.pushover.enabled).toBe(true);
        expect(config.pushover.token).toBe("global-token");
        expect(config.pushover.userKey).toBe("global-user");
        expect(config.telegram.enabled).toBe(false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should merge project config over global config", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const globalConfigDir = path.join(os.homedir(), ".config", "opencode");
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(globalConfigDir, { recursive: true });
        const globalConfig: Partial<EverynotifyConfig> = {
          pushover: {
            enabled: true,
            token: "global-token",
            userKey: "global-user",
          },
          telegram: {
            enabled: true,
            botToken: "global-bot",
            chatId: "global-chat",
          },
        };
        fs.writeFileSync(
          path.join(globalConfigDir, ".everynotify.json"),
          JSON.stringify(globalConfig),
        );

        fs.mkdirSync(projectConfigDir, { recursive: true });
        const projectConfig: Partial<EverynotifyConfig> = {
          pushover: {
            enabled: true,
            token: "project-token",
            userKey: "project-user",
          },
        };
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify(projectConfig),
        );

        const config = loadConfig(tempDir);

        expect(config.pushover.token).toBe("project-token");
        expect(config.pushover.userKey).toBe("project-user");
        expect(config.telegram.enabled).toBe(true);
        expect(config.telegram.botToken).toBe("global-bot");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should handle invalid JSON gracefully", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          "{ invalid json }",
        );

        const originalError = console.error;
        const logs: string[] = [];
        console.error = (msg: string) => logs.push(msg);

        const config = loadConfig(tempDir);

        expect(config.pushover.enabled).toBe(false);
        expect(
          logs.some((log) =>
            log.includes("[EveryNotify] Failed to load config"),
          ),
        ).toBe(true);

        console.error = originalError;
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should use only global config when project config missing", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const globalConfigDir = path.join(os.homedir(), ".config", "opencode");

      try {
        fs.mkdirSync(globalConfigDir, { recursive: true });
        const globalConfig: Partial<EverynotifyConfig> = {
          slack: {
            enabled: true,
            webhookUrl: "https://hooks.slack.com/services/...",
          },
        };
        fs.writeFileSync(
          path.join(globalConfigDir, ".everynotify.json"),
          JSON.stringify(globalConfig),
        );

        const config = loadConfig(tempDir);

        expect(config.slack.enabled).toBe(true);
        expect(config.slack.webhookUrl).toBe(
          "https://hooks.slack.com/services/...",
        );
        expect(config.pushover.enabled).toBe(false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should use only project config when global config missing", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        const projectConfig: Partial<EverynotifyConfig> = {
          discord: {
            enabled: true,
            webhookUrl: "https://discord.com/api/webhooks/...",
          },
        };
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify(projectConfig),
        );

        const config = loadConfig(tempDir);

        expect(config.discord.enabled).toBe(true);
        expect(config.discord.webhookUrl).toBe(
          "https://discord.com/api/webhooks/...",
        );
        expect(config.telegram.enabled).toBe(false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should handle partial service configs correctly", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        const projectConfig = {
          pushover: {
            enabled: true,
          },
        };
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify(projectConfig),
        );

        const config = loadConfig(tempDir);

        expect(config.pushover.enabled).toBe(true);
        expect(config.pushover.token).toBe("");
        expect(config.pushover.userKey).toBe("");
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
