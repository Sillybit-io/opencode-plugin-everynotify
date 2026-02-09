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
import {
  DEFAULT_CONFIG,
  getConfigPath,
  loadConfig,
  validateConfig,
} from "../config";
import type { EverynotifyConfig } from "../types";

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

  afterEach(() => {
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

    it("should have delay set to 120 seconds", () => {
      expect(DEFAULT_CONFIG.delay).toBe(120);
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
      const { config } = loadConfig("/nonexistent/directory/12345");
      expect(config.pushover.enabled).toBe(false);
      expect(config.telegram.enabled).toBe(false);
      expect(config.slack.enabled).toBe(false);
      expect(config.discord.enabled).toBe(false);
    });

    it("should return warning when all services disabled", () => {
      const { warnings } = loadConfig("/nonexistent/directory/12345");

      expect(warnings.some((w) => w.includes("No services configured"))).toBe(
        true,
      );
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

        const { config } = loadConfig(tempDir);

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

        const { config } = loadConfig(tempDir);

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

        const { config, warnings } = loadConfig(tempDir);

        expect(config.pushover.enabled).toBe(false);
        expect(warnings.some((w) => w.includes("Failed to load config"))).toBe(
          true,
        );
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

        const { config } = loadConfig(tempDir);

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

        const { config } = loadConfig(tempDir);

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

        const { config, warnings } = loadConfig(tempDir);

        // Validation disables pushover because token/userKey are empty
        expect(config.pushover.enabled).toBe(false);
        expect(config.pushover.token).toBe("");
        expect(config.pushover.userKey).toBe("");
        expect(
          warnings.some(
            (w) => w.includes("Pushover") && w.includes("Service disabled"),
          ),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should use default delay when no config files exist", () => {
      const { config } = loadConfig("/nonexistent/directory/12345");
      expect(config.delay).toBe(120);
    });

    it("should allow global config to override delay", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const globalConfigDir = path.join(os.homedir(), ".config", "opencode");

      try {
        fs.mkdirSync(globalConfigDir, { recursive: true });
        const globalConfig: Partial<EverynotifyConfig> = {
          delay: 60,
        };
        fs.writeFileSync(
          path.join(globalConfigDir, ".everynotify.json"),
          JSON.stringify(globalConfig),
        );

        const { config } = loadConfig(tempDir);

        expect(config.delay).toBe(60);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should allow project config to override global delay", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const globalConfigDir = path.join(os.homedir(), ".config", "opencode");
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(globalConfigDir, { recursive: true });
        const globalConfig: Partial<EverynotifyConfig> = {
          delay: 60,
        };
        fs.writeFileSync(
          path.join(globalConfigDir, ".everynotify.json"),
          JSON.stringify(globalConfig),
        );

        fs.mkdirSync(projectConfigDir, { recursive: true });
        const projectConfig: Partial<EverynotifyConfig> = {
          delay: 30,
        };
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify(projectConfig),
        );

        const { config } = loadConfig(tempDir);

        expect(config.delay).toBe(30);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should preserve delay: 0 as a valid value", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        const projectConfig: Partial<EverynotifyConfig> = {
          delay: 0,
        };
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify(projectConfig),
        );

        const { config } = loadConfig(tempDir);

        expect(config.delay).toBe(0);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should disable Pushover and warn when enabled with missing token", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify({
            pushover: { enabled: true, token: "", userKey: "valid-user" },
          }),
        );

        const { config, warnings } = loadConfig(tempDir);

        expect(config.pushover.enabled).toBe(false);
        expect(
          warnings.some((w) => w.includes("Pushover") && w.includes("token")),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should disable Pushover and warn when enabled with missing userKey", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify({
            pushover: { enabled: true, token: "valid-token", userKey: "" },
          }),
        );

        const { config, warnings } = loadConfig(tempDir);

        expect(config.pushover.enabled).toBe(false);
        expect(
          warnings.some((w) => w.includes("Pushover") && w.includes("userKey")),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should disable Pushover and list both missing fields", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify({
            pushover: { enabled: true },
          }),
        );

        const { config, warnings } = loadConfig(tempDir);

        expect(config.pushover.enabled).toBe(false);
        expect(
          warnings.some(
            (w) =>
              w.includes("Pushover") &&
              w.includes("token") &&
              w.includes("userKey"),
          ),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should disable Telegram and warn when enabled with missing botToken", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify({
            telegram: { enabled: true, botToken: "", chatId: "valid-chat" },
          }),
        );

        const { config, warnings } = loadConfig(tempDir);

        expect(config.telegram.enabled).toBe(false);
        expect(
          warnings.some(
            (w) => w.includes("Telegram") && w.includes("botToken"),
          ),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should disable Telegram and warn when enabled with missing chatId", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify({
            telegram: {
              enabled: true,
              botToken: "valid-bot",
              chatId: "",
            },
          }),
        );

        const { config, warnings } = loadConfig(tempDir);

        expect(config.telegram.enabled).toBe(false);
        expect(
          warnings.some((w) => w.includes("Telegram") && w.includes("chatId")),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should disable Slack and warn when enabled with missing webhookUrl", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify({
            slack: { enabled: true, webhookUrl: "" },
          }),
        );

        const { config, warnings } = loadConfig(tempDir);

        expect(config.slack.enabled).toBe(false);
        expect(
          warnings.some((w) => w.includes("Slack") && w.includes("webhookUrl")),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should disable Discord and warn when enabled with missing webhookUrl", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify({
            discord: { enabled: true, webhookUrl: "" },
          }),
        );

        const { config, warnings } = loadConfig(tempDir);

        expect(config.discord.enabled).toBe(false);
        expect(
          warnings.some(
            (w) => w.includes("Discord") && w.includes("webhookUrl"),
          ),
        ).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should not warn for disabled services with missing credentials", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify({
            pushover: { enabled: false, token: "", userKey: "" },
            telegram: { enabled: false, botToken: "", chatId: "" },
            slack: { enabled: false, webhookUrl: "" },
            discord: { enabled: false, webhookUrl: "" },
          }),
        );

        const { warnings } = loadConfig(tempDir);

        expect(warnings.some((w) => w.includes("missing required"))).toBe(
          false,
        );
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it("should keep valid services enabled while disabling invalid ones", () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-"));
      const projectConfigDir = path.join(tempDir, ".opencode");

      try {
        fs.mkdirSync(projectConfigDir, { recursive: true });
        fs.writeFileSync(
          path.join(projectConfigDir, ".everynotify.json"),
          JSON.stringify({
            pushover: {
              enabled: true,
              token: "valid-token",
              userKey: "valid-user",
            },
            telegram: { enabled: true, botToken: "", chatId: "" },
          }),
        );

        const { config, warnings } = loadConfig(tempDir);

        expect(config.pushover.enabled).toBe(true);
        expect(config.telegram.enabled).toBe(false);
        expect(warnings.some((w) => w.includes("Telegram"))).toBe(true);
        expect(warnings.some((w) => w.includes("Pushover"))).toBe(false);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe("validateConfig", () => {
    it("should mutate config in-place to disable invalid services", () => {
      const config: EverynotifyConfig = {
        ...DEFAULT_CONFIG,
        pushover: { enabled: true, token: "", userKey: "", priority: 0 },
      };
      const warnings: string[] = [];

      validateConfig(config, warnings);

      expect(config.pushover.enabled).toBe(false);
      expect(warnings.length).toBe(1);
    });

    it("should not modify valid services", () => {
      const config: EverynotifyConfig = {
        ...DEFAULT_CONFIG,
        pushover: {
          enabled: true,
          token: "valid",
          userKey: "valid",
          priority: 0,
        },
      };
      const warnings: string[] = [];

      validateConfig(config, warnings);

      expect(config.pushover.enabled).toBe(true);
      expect(warnings.length).toBe(0);
    });
  });
});
