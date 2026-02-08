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
import type { PushoverConfig, NotificationPayload } from "../../types";

let send: typeof import("../../services/pushover").send;
let fetchSpy: ReturnType<typeof spyOn>;
let abortSignal: AbortSignal;

describe("Pushover Service", () => {
  beforeAll(async () => {
    // Use query string to bypass mock.module registry from integration tests
    const mod = await import("../../services/pushover?real");
    send = mod.send;
  });

  beforeEach(() => {
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(new Response("OK", { status: 200 })),
    );

    const controller = new AbortController();
    abortSignal = controller.signal;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const mockConfig: PushoverConfig = {
    enabled: true,
    token: "app_token_30_chars_1234567890",
    userKey: "user_key_30_chars_1234567890",
    priority: 1,
  };

  const mockPayload: NotificationPayload = {
    eventType: "complete",
    title: "Test Title",
    message: "Test message content",
    projectName: "test-project",
    timestamp: Date.now(),
    sessionID: "session-123",
    elapsedSeconds: 42,
  };

  it("sends POST to correct Pushover API endpoint", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.pushover.net/1/messages.json");
  });

  it("uses application/x-www-form-urlencoded content type", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("includes token, user, message, title, and priority in body", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = options.body;

    expect(body).toContain("token=app_token_30_chars_1234567890");
    expect(body).toContain("user=user_key_30_chars_1234567890");
    expect(body).toContain("message=Test+message+content");
    expect(body).toContain("title=Test+Title");
    expect(body).toContain("priority=1");
  });

  it("truncates message at 1024 characters", async () => {
    const longMessage = "x".repeat(2000);
    const payload: NotificationPayload = {
      ...mockPayload,
      message: longMessage,
    };

    await send(mockConfig, payload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = options.body;

    expect(body).toContain("message=");
    const messageMatch = body.match(/message=([^&]*)/);
    expect(messageMatch).toBeTruthy();
    const encodedMessage = messageMatch![1];
    const decodedMessage = decodeURIComponent(
      encodedMessage.replace(/\+/g, " "),
    );
    expect(decodedMessage.length).toBeLessThanOrEqual(1024);
  });

  it("truncates title at 250 characters", async () => {
    const longTitle = "y".repeat(500);
    const payload: NotificationPayload = {
      ...mockPayload,
      title: longTitle,
    };

    await send(mockConfig, payload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = options.body;

    expect(body).toContain("title=");
    const titleMatch = body.match(/title=([^&]*)/);
    expect(titleMatch).toBeTruthy();
    const encodedTitle = titleMatch![1];
    const decodedTitle = decodeURIComponent(encodedTitle.replace(/\+/g, " "));
    expect(decodedTitle.length).toBeLessThanOrEqual(250);
  });

  it("passes AbortSignal to fetch for timeout control", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.signal).toBe(abortSignal);
  });

  it("throws on non-2xx response", async () => {
    const errorResponse = new Response("Invalid token", { status: 401 });
    fetchSpy.mockImplementation(() => Promise.resolve(errorResponse));

    await expect(send(mockConfig, mockPayload, abortSignal)).rejects.toThrow(
      "Pushover API error: 401",
    );
  });

  it("throws on fetch exception (network error)", async () => {
    const fetchError = new Error("Network timeout");
    fetchSpy.mockImplementation(() => Promise.reject(fetchError));

    await expect(send(mockConfig, mockPayload, abortSignal)).rejects.toThrow(
      "Network timeout",
    );
  });

  it("throws on AbortSignal abort", async () => {
    const controller = new AbortController();
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    fetchSpy.mockImplementation(() => Promise.reject(abortError));

    await expect(
      send(mockConfig, mockPayload, controller.signal),
    ).rejects.toThrow("The operation was aborted");
  });

  it("uses default priority 0 when not specified", async () => {
    const configNoPriority: PushoverConfig = {
      ...mockConfig,
      priority: undefined,
    };

    await send(configNoPriority, mockPayload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = options.body;
    expect(body).toContain("priority=0");
  });

  it("does not throw on successful response", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 1 }), { status: 200 }),
      ),
    );

    await expect(
      send(mockConfig, mockPayload, abortSignal),
    ).resolves.toBeUndefined();
  });
});
