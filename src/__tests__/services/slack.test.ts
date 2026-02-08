/// <reference types="bun" />
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  spyOn,
} from "bun:test";
import type { SlackConfig, NotificationPayload } from "../../types";

let send: typeof import("../../services/slack").send;
let fetchSpy: ReturnType<typeof spyOn>;

describe("Slack Service", () => {
  beforeAll(async () => {
    // Use query string to bypass mock.module registry from integration tests
    const mod = await import("../../services/slack?real");
    send = mod.send;
  });

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("sends POST to correct webhook URL", async () => {
    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "complete",
      title: "Test Title",
      message: "Test Message",
      projectName: "test-project",
      timestamp: Date.now(),
      sessionID: "session-123",
      elapsedSeconds: 42,
    };
    const controller = new AbortController();

    await send(config, payload, controller.signal);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(config.webhookUrl);
  });

  it("uses POST method", async () => {
    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "error",
      title: "Error Title",
      message: "Error Message",
      projectName: null,
      timestamp: Date.now(),
      sessionID: null,
      elapsedSeconds: null,
    };
    const controller = new AbortController();

    await send(config, payload, controller.signal);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.method).toBe("POST");
  });

  it("sets Content-Type to application/json", async () => {
    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "complete",
      title: "Title",
      message: "Message",
      projectName: "project",
      timestamp: Date.now(),
      sessionID: "session",
      elapsedSeconds: 10,
    };
    const controller = new AbortController();

    await send(config, payload, controller.signal);

    const [, options] = fetchSpy.mock.calls[0];
    const headers = options?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends JSON body with text field containing formatted message", async () => {
    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "complete",
      title: "My Title",
      message: "My Message",
      projectName: "project",
      timestamp: Date.now(),
      sessionID: "session",
      elapsedSeconds: 10,
    };
    const controller = new AbortController();

    await send(config, payload, controller.signal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = options?.body as string;
    const parsed = JSON.parse(body);
    expect(parsed.text).toBe("*My Title*\nMy Message");
  });

  it("formats message with mrkdwn bold title", async () => {
    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "complete",
      title: "Bold Title",
      message: "Regular message",
      projectName: null,
      timestamp: Date.now(),
      sessionID: null,
      elapsedSeconds: null,
    };
    const controller = new AbortController();

    await send(config, payload, controller.signal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = options?.body as string;
    const parsed = JSON.parse(body);
    expect(parsed.text).toContain("*Bold Title*");
  });

  it("truncates message at 40000 characters", async () => {
    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const longMessage = "x".repeat(50000);
    const payload: NotificationPayload = {
      eventType: "complete",
      title: "Title",
      message: longMessage,
      projectName: null,
      timestamp: Date.now(),
      sessionID: null,
      elapsedSeconds: null,
    };
    const controller = new AbortController();

    await send(config, payload, controller.signal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = options?.body as string;
    const parsed = JSON.parse(body);
    expect(parsed.text.length).toBeLessThanOrEqual(40000);
  });

  it("passes AbortSignal to fetch", async () => {
    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "complete",
      title: "Title",
      message: "Message",
      projectName: null,
      timestamp: Date.now(),
      sessionID: null,
      elapsedSeconds: null,
    };
    const controller = new AbortController();

    await send(config, payload, controller.signal);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options?.signal).toBe(controller.signal);
  });

  it("throws on non-2xx response", async () => {
    fetchSpy.mockImplementation(async () => {
      return new Response("Unauthorized", { status: 401 });
    });

    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "error",
      title: "Error",
      message: "Error message",
      projectName: null,
      timestamp: Date.now(),
      sessionID: null,
      elapsedSeconds: null,
    };
    const controller = new AbortController();

    await expect(send(config, payload, controller.signal)).rejects.toThrow(
      "Slack API error: 401",
    );
  });

  it("throws on fetch exception (network error)", async () => {
    fetchSpy.mockImplementation(async () => {
      throw new Error("Network error");
    });

    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "error",
      title: "Error",
      message: "Error message",
      projectName: null,
      timestamp: Date.now(),
      sessionID: null,
      elapsedSeconds: null,
    };
    const controller = new AbortController();

    await expect(send(config, payload, controller.signal)).rejects.toThrow(
      "Network error",
    );
  });

  it("does not throw on successful response", async () => {
    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "complete",
      title: "Success",
      message: "All good",
      projectName: "project",
      timestamp: Date.now(),
      sessionID: "session",
      elapsedSeconds: 5,
    };
    const controller = new AbortController();

    await expect(
      send(config, payload, controller.signal),
    ).resolves.toBeUndefined();
  });

  it("throws on AbortSignal abort", async () => {
    fetchSpy.mockImplementation(async () => {
      throw new Error("AbortError");
    });

    const config: SlackConfig = {
      enabled: true,
      webhookUrl:
        "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX",
    };
    const payload: NotificationPayload = {
      eventType: "complete",
      title: "Title",
      message: "Message",
      projectName: null,
      timestamp: Date.now(),
      sessionID: null,
      elapsedSeconds: null,
    };
    const controller = new AbortController();

    await expect(send(config, payload, controller.signal)).rejects.toThrow(
      "AbortError",
    );
  });
});
