/**
 * Tests for process exit flush behavior
 *
 * Verifies that the plugin registers a beforeExit handler
 * and that the flush guard prevents double-flush.
 */

import {
  describe,
  test,
  expect,
  mock,
  beforeAll,
  afterAll,
  spyOn,
  beforeEach,
} from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import type { ServiceSendFunction } from "../types";

let fakeHomeDir: string;
let tempDir: string;
let homedirSpy: ReturnType<typeof spyOn>;

const mockPushoverSend = mock<ServiceSendFunction>(() => Promise.resolve());

mock.module("../services/pushover", () => ({ send: mockPushoverSend }));
mock.module("../services/telegram", () => ({
  send: mock(() => Promise.resolve()),
}));
mock.module("../services/slack", () => ({
  send: mock(() => Promise.resolve()),
}));
mock.module("../services/discord", () => ({
  send: mock(() => Promise.resolve()),
}));

describe("Process Exit Flush", () => {
  beforeAll(() => {
    fakeHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "everynotify-exit-home-"),
    );
    homedirSpy = spyOn(os, "homedir").mockReturnValue(fakeHomeDir);

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "everynotify-exit-"));
    const configDir = path.join(tempDir, ".opencode");
    fs.mkdirSync(configDir, { recursive: true });

    fs.writeFileSync(
      path.join(configDir, ".everynotify.json"),
      JSON.stringify({
        pushover: {
          enabled: true,
          token: "test-token",
          userKey: "test-user",
          priority: 0,
        },
        telegram: { enabled: false, botToken: "", chatId: "" },
        slack: { enabled: false, webhookUrl: "" },
        discord: { enabled: false, webhookUrl: "" },
        delay: 300,
      }),
    );
  });

  afterAll(() => {
    homedirSpy.mockRestore();
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    if (fakeHomeDir) fs.rmSync(fakeHomeDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    mockPushoverSend.mockClear();
  });

  test("plugin registers a beforeExit listener", async () => {
    const registeredHandlers: Array<{ event: string; handler: Function }> = [];
    const processOnSpy = spyOn(process, "on").mockImplementation(
      (event: string, handler: any) => {
        registeredHandlers.push({ event, handler });
        return process;
      },
    );

    try {
      mock.module("../logger", () => ({
        createLogger: mock(() => ({
          error: mock(() => {}),
          warn: mock(() => {}),
        })),
        getLogFilePath: mock(() => "/tmp/test.log"),
      }));

      const { default: EverynotifyPlugin } = await import("../index");

      const mockInput = {
        client: {
          session: {
            get: mock(() =>
              Promise.resolve({ data: { id: "s", parentID: null } }),
            ),
            messages: mock(() => Promise.resolve({ data: [] })),
          },
        },
        directory: tempDir,
      };

      await EverynotifyPlugin(mockInput as any);

      const beforeExitHandlers = registeredHandlers.filter(
        (h) => h.event === "beforeExit",
      );
      expect(beforeExitHandlers.length).toBeGreaterThanOrEqual(1);
    } finally {
      processOnSpy.mockRestore();
    }
  });

  test("flush guard prevents double execution", async () => {
    const { createDispatcher } = await import("../dispatcher");

    const mockLogger = { error: mock(() => {}), warn: mock(() => {}) };
    const config = {
      pushover: {
        enabled: true,
        token: "test-token",
        userKey: "test-user",
        priority: 0,
      },
      telegram: { enabled: false, botToken: "", chatId: "" },
      slack: { enabled: false, webhookUrl: "" },
      discord: { enabled: false, webhookUrl: "" },
      log: { enabled: false },
      events: {
        complete: true,
        subagent_complete: true,
        error: true,
        permission: true,
        question: true,
      },
      truncateFrom: "end" as const,
      delay: 300,
    };

    const { dispatch, flush } = createDispatcher(config, mockLogger);

    await dispatch({
      eventType: "complete",
      title: "test",
      message: "test flush",
      projectName: "test",
      timestamp: Date.now(),
      sessionID: "test",
      elapsedSeconds: 10,
    });

    let flushed = false;
    async function onBeforeExit(): Promise<void> {
      if (flushed) return;
      flushed = true;
      await flush();
    }

    await onBeforeExit();
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);

    await onBeforeExit();
    expect(mockPushoverSend).toHaveBeenCalledTimes(1);
  });

  test("flush sends pending delayed events that would otherwise be lost", async () => {
    const { createDispatcher } = await import("../dispatcher");

    const mockLogger = { error: mock(() => {}), warn: mock(() => {}) };
    const config = {
      pushover: {
        enabled: true,
        token: "test-token",
        userKey: "test-user",
        priority: 0,
      },
      telegram: { enabled: false, botToken: "", chatId: "" },
      slack: { enabled: false, webhookUrl: "" },
      discord: { enabled: false, webhookUrl: "" },
      log: { enabled: false },
      events: {
        complete: true,
        subagent_complete: true,
        error: true,
        permission: true,
        question: true,
      },
      truncateFrom: "end" as const,
      delay: 600,
    };

    const { dispatch, flush } = createDispatcher(config, mockLogger);

    await dispatch({
      eventType: "complete",
      title: "test",
      message: "would be lost without flush",
      projectName: "test",
      timestamp: Date.now(),
      sessionID: "s1",
      elapsedSeconds: 5,
    });

    await dispatch({
      eventType: "question",
      title: "test",
      message: "also pending",
      projectName: "test",
      timestamp: Date.now(),
      sessionID: "s2",
      elapsedSeconds: 3,
    });

    expect(mockPushoverSend).toHaveBeenCalledTimes(0);

    await flush();

    expect(mockPushoverSend).toHaveBeenCalledTimes(2);
  });
});
