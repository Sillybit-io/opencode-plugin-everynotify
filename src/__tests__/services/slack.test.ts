/// <reference types="bun" />
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { send } from "../../services/slack";
import type { SlackConfig, NotificationPayload } from "../../types";

describe("Slack Service", () => {
  let fetchMock: ReturnType<typeof mock>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = mock(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    globalThis.fetch = fetchMock as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
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

    const [, options] = fetchMock.mock.calls[0];
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

    const [, options] = fetchMock.mock.calls[0];
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

    const [, options] = fetchMock.mock.calls[0];
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

    const [, options] = fetchMock.mock.calls[0];
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

    const [, options] = fetchMock.mock.calls[0];
    const body = options?.body as string;
    const parsed = JSON.parse(body);
    expect(parsed.text.length).toBeLessThanOrEqual(40000);
    expect(parsed.text).toContain("… [truncated]");
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

    const [, options] = fetchMock.mock.calls[0];
    expect(options?.signal).toBe(controller.signal);
  });

  it("logs error on non-2xx response without throwing", async () => {
    let errorLogged = false;
    let loggedMessage = "";
    const originalError = console.error;
    console.error = (msg: string) => {
      errorLogged = true;
      loggedMessage = msg;
    };

    globalThis.fetch = async () => {
      return new Response("Unauthorized", { status: 401 });
    };

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

    await send(config, payload, controller.signal);

    expect(errorLogged).toBe(true);
    expect(loggedMessage).toContain("[EveryNotify] Slack error");
    expect(loggedMessage).toContain("401");

    console.error = originalError;
  });

  it("logs error on fetch exception without throwing", async () => {
    let errorLogged = false;
    let loggedMessage = "";
    const originalError = console.error;
    console.error = (msg: string) => {
      errorLogged = true;
      loggedMessage = msg;
    };

    globalThis.fetch = async () => {
      throw new Error("Network error");
    };

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

    await send(config, payload, controller.signal);

    expect(errorLogged).toBe(true);
    expect(loggedMessage).toContain("[EveryNotify] Slack failed");
    expect(loggedMessage).toContain("Network error");

    console.error = originalError;
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

    let threw = false;
    try {
      await send(config, payload, controller.signal);
    } catch {
      threw = true;
    }

    expect(threw).toBe(false);
  });

  it("handles AbortSignal abort gracefully", async () => {
    let errorLogged = false;
    const originalError = console.error;
    console.error = (msg: string) => {
      errorLogged = true;
    };

    globalThis.fetch = async () => {
      throw new Error("AbortError");
    };

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

    expect(errorLogged).toBe(true);

    console.error = originalError;
  });
});
