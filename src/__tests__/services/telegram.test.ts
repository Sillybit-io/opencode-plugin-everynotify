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
import type { TelegramConfig, NotificationPayload } from "../../types";

let send: typeof import("../../services/telegram").send;
let fetchSpy: ReturnType<typeof spyOn>;
let abortSignal: AbortSignal;

describe("Telegram Service", () => {
  beforeAll(async () => {
    // Use query string to bypass mock.module registry from integration tests
    const mod = await import("../../services/telegram?real");
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

  const mockConfig: TelegramConfig = {
    enabled: true,
    botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
    chatId: "-1001234567890",
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

  it("sends POST to correct Telegram API endpoint with bot token in path", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      `https://api.telegram.org/bot${mockConfig.botToken}/sendMessage`,
    );
  });

  it("uses application/json content type", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.headers["Content-Type"]).toBe("application/json");
  });

  it("includes chat_id, text, and parse_mode in JSON body", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.chat_id).toBe(mockConfig.chatId);
    expect(body.text).toContain("<b>Test Title</b>");
    expect(body.text).toContain("Test message content");
    expect(body.parse_mode).toBe("HTML");
  });

  it("formats message with HTML bold title", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.text).toBe("<b>Test Title</b>\nTest message content");
  });

  it("truncates message at 4096 characters", async () => {
    const longMessage = "x".repeat(5000);
    const payload: NotificationPayload = {
      ...mockPayload,
      message: longMessage,
    };

    await send(mockConfig, payload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.text.length).toBeLessThanOrEqual(4096);
  });

  it("passes AbortSignal to fetch for timeout control", async () => {
    await send(mockConfig, mockPayload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    expect(options.signal).toBe(abortSignal);
  });

  it("throws on non-2xx response", async () => {
    const errorResponse = new Response("Unauthorized", { status: 401 });
    fetchSpy.mockImplementation(() => Promise.resolve(errorResponse));

    await expect(send(mockConfig, mockPayload, abortSignal)).rejects.toThrow(
      "Telegram API error: 401",
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

  it("does not throw on successful response", async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ ok: true, result: { message_id: 123 } }),
          {
            status: 200,
          },
        ),
      ),
    );

    await expect(
      send(mockConfig, mockPayload, abortSignal),
    ).resolves.toBeUndefined();
  });

  it("handles very long titles with truncation", async () => {
    const longTitle = "T".repeat(3000);
    const payload: NotificationPayload = {
      ...mockPayload,
      title: longTitle,
    };

    await send(mockConfig, payload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.text.length).toBeLessThanOrEqual(4096);
  });

  it("uses correct chat_id format for group chats", async () => {
    const groupConfig: TelegramConfig = {
      enabled: true,
      botToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh",
      chatId: "-1001234567890",
    };

    await send(groupConfig, mockPayload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.chat_id).toBe("-1001234567890");
  });

  it("handles empty message gracefully", async () => {
    const payload: NotificationPayload = {
      ...mockPayload,
      message: "",
    };

    await send(mockConfig, payload, abortSignal);

    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);

    expect(body.text).toBe("<b>Test Title</b>\n");
  });
});
