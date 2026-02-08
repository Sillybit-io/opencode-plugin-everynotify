/// <reference types="bun" />
import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { send } from "../../services/pushover";
import type { PushoverConfig, NotificationPayload } from "../../types";

describe("Pushover Service", () => {
  let fetchMock: ReturnType<typeof mock>;
  let abortSignal: AbortSignal;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    // Save original fetch
    originalFetch = globalThis.fetch;

    // Mock globalThis.fetch
    fetchMock = mock(() =>
      Promise.resolve(new Response("OK", { status: 200 })),
    );
    globalThis.fetch = fetchMock as any;

    // Create a valid AbortSignal
    const controller = new AbortController();
    abortSignal = controller.signal;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
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

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.pushover.net/1/messages.json");
  });

  it("uses application/x-www-form-urlencoded content type", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("includes token, user, message, title, and priority in body", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    const body = options.body;

    // URLSearchParams.toString() produces key=value&key=value format
    // Spaces are encoded as + (valid URL encoding)
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

    const [, options] = fetchMock.mock.calls[0];
    const body = options.body;

    expect(body).toContain("message=");
    const messageMatch = body.match(/message=([^&]*)/);
    expect(messageMatch).toBeTruthy();
    const encodedMessage = messageMatch![1];
    // Decode both + and %xx encoding
    const decodedMessage = decodeURIComponent(
      encodedMessage.replace(/\+/g, " "),
    );
    expect(decodedMessage.length).toBeLessThanOrEqual(1024);
    expect(decodedMessage).toContain("… [truncated]");
  });

  it("truncates title at 250 characters", async () => {
    const longTitle = "y".repeat(500);
    const payload: NotificationPayload = {
      ...mockPayload,
      title: longTitle,
    };

    await send(mockConfig, payload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    const body = options.body;

    expect(body).toContain("title=");
    const titleMatch = body.match(/title=([^&]*)/);
    expect(titleMatch).toBeTruthy();
    const encodedTitle = titleMatch![1];
    // Decode both + and %xx encoding
    const decodedTitle = decodeURIComponent(encodedTitle.replace(/\+/g, " "));
    expect(decodedTitle.length).toBeLessThanOrEqual(250);
    expect(decodedTitle).toContain("… [truncated]");
  });

  it("passes AbortSignal to fetch for timeout control", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    expect(options.signal).toBe(abortSignal);
  });

  it("logs error on non-2xx response without throwing", async () => {
    const errorResponse = new Response("Invalid token", { status: 401 });
    fetchMock = mock(() => Promise.resolve(errorResponse));
    globalThis.fetch = fetchMock as any;

    const consoleErrorSpy = mock(() => {});
    const originalError = console.error;
    console.error = consoleErrorSpy as any;

    try {
      await send(mockConfig, mockPayload, abortSignal);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [message] = consoleErrorSpy.mock.calls[0];
      expect(message).toContain("[EveryNotify] Pushover error:");
      expect(message).toContain("401");
    } finally {
      console.error = originalError;
    }
  });

  it("logs error on fetch exception without throwing", async () => {
    const fetchError = new Error("Network timeout");
    fetchMock = mock(() => Promise.reject(fetchError));
    globalThis.fetch = fetchMock as any;

    const consoleErrorSpy = mock(() => {});
    const originalError = console.error;
    console.error = consoleErrorSpy as any;

    try {
      await send(mockConfig, mockPayload, abortSignal);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [message] = consoleErrorSpy.mock.calls[0];
      expect(message).toContain("[EveryNotify] Pushover failed:");
      expect(message).toContain("Network timeout");
    } finally {
      console.error = originalError;
    }
  });

  it("handles AbortSignal abort gracefully", async () => {
    const controller = new AbortController();
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";

    fetchMock = mock(() => Promise.reject(abortError));
    globalThis.fetch = fetchMock as any;

    const consoleErrorSpy = mock(() => {});
    const originalError = console.error;
    console.error = consoleErrorSpy as any;

    try {
      await send(mockConfig, mockPayload, controller.signal);

      // Should log the abort error
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      const [message] = consoleErrorSpy.mock.calls[0];
      expect(message).toContain("[EveryNotify] Pushover failed:");
    } finally {
      console.error = originalError;
    }
  });

  it("uses default priority 0 when not specified", async () => {
    const configNoPriority: PushoverConfig = {
      ...mockConfig,
      priority: undefined,
    };

    await send(configNoPriority, mockPayload, abortSignal);

    const [, options] = fetchMock.mock.calls[0];
    const body = options.body;
    expect(body).toContain("priority=0");
  });

  it("does not throw on successful response", async () => {
    fetchMock = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify({ status: 1 }), { status: 200 }),
      ),
    );
    globalThis.fetch = fetchMock as any;

    // Should not throw
    await expect(
      send(mockConfig, mockPayload, abortSignal),
    ).resolves.toBeUndefined();
  });
});
