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
import type { DiscordConfig, NotificationPayload } from "../../types";

let send: typeof import("../../services/discord").send;
let fetchSpy: ReturnType<typeof spyOn>;

const mockConsoleError = mock(() => {});

describe("Discord Service", () => {
  let originalConsoleError: typeof console.error;

  beforeAll(async () => {
    // Use query string to bypass mock.module registry from integration tests
    const mod = await import("../../services/discord?real");
    send = mod.send;
  });

  beforeEach(() => {
    mockConsoleError.mockClear();
    originalConsoleError = console.error;
    console.error = mockConsoleError as any;

    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({}), { status: 204 });
    });
  });

  afterEach(() => {
    console.error = originalConsoleError;
    fetchSpy.mockRestore();
  });

  const config: DiscordConfig = {
    enabled: true,
    webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefghijklmnop",
  };

  const payload: NotificationPayload = {
    eventType: "complete",
    title: "Test Title",
    message: "Test message content",
    projectName: "test-project",
    timestamp: Date.now(),
    sessionID: "session-123",
    elapsedSeconds: 42,
  };

  describe("send()", () => {
    it("should POST to correct webhook URL", async () => {
      const signal = new AbortController().signal;
      await send(config, payload, signal);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe(config.webhookUrl);
    });

    it("should send JSON body with content field", async () => {
      const signal = new AbortController().signal;
      await send(config, payload, signal);

      const [, options] = fetchSpy.mock.calls[0];
      expect(options?.method).toBe("POST");
      expect(options?.headers).toEqual({
        "Content-Type": "application/json",
      });

      const body = JSON.parse(options?.body as string);
      expect(body).toHaveProperty("content");
      expect(typeof body.content).toBe("string");
    });

    it("should format message with Discord markdown (bold title)", async () => {
      const signal = new AbortController().signal;
      await send(config, payload, signal);

      const [, options] = fetchSpy.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.content).toContain("**Test Title**");
      expect(body.content).toContain("Test message content");
    });

    it("should truncate message at 2000 characters", async () => {
      const longMessage = "x".repeat(3000);
      const longPayload: NotificationPayload = {
        ...payload,
        message: longMessage,
      };

      const signal = new AbortController().signal;
      await send(config, longPayload, signal);

      const [, options] = fetchSpy.mock.calls[0];
      const body = JSON.parse(options?.body as string);
      expect(body.content.length).toBeLessThanOrEqual(2000);
      expect(body.content).toContain("… [truncated]");
    });

    it("should pass AbortSignal to fetch for timeout control", async () => {
      const controller = new AbortController();
      await send(config, payload, controller.signal);

      const [, options] = fetchSpy.mock.calls[0];
      expect(options?.signal).toBe(controller.signal);
    });

    it("should log rate limit warning on 429 response with Retry-After header", async () => {
      fetchSpy.mockImplementation(async () => {
        return new Response(JSON.stringify({}), {
          status: 429,
          headers: { "Retry-After": "5" },
        });
      });

      const signal = new AbortController().signal;
      await send(config, payload, signal);

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      const errorMsg = mockConsoleError.mock.calls[0][0];
      expect(errorMsg).toContain("Discord rate limited");
      expect(errorMsg).toContain("Retry-After: 5s");
    });

    it("should log error on non-2xx response (not 429)", async () => {
      fetchSpy.mockImplementation(async () => {
        return new Response("Invalid webhook URL", { status: 404 });
      });

      const signal = new AbortController().signal;
      await send(config, payload, signal);

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      const errorMsg = mockConsoleError.mock.calls[0][0];
      expect(errorMsg).toContain("Discord error");
      expect(errorMsg).toContain("404");
    });

    it("should log error on fetch failure (network error)", async () => {
      fetchSpy.mockImplementation(async () => {
        throw new Error("Network timeout");
      });

      const signal = new AbortController().signal;
      await send(config, payload, signal);

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      const errorMsg = mockConsoleError.mock.calls[0][0];
      expect(errorMsg).toContain("Discord failed");
      expect(errorMsg).toContain("Network timeout");
    });

    it("should not throw on any error (graceful error handling)", async () => {
      fetchSpy.mockImplementation(async () => {
        throw new Error("Network error");
      });

      const signal = new AbortController().signal;
      expect(async () => {
        await send(config, payload, signal);
      }).not.toThrow();
    });

    it("should handle AbortSignal timeout gracefully", async () => {
      fetchSpy.mockImplementation(async () => {
        throw new Error("The operation was aborted");
      });

      const signal = new AbortController().signal;
      await send(config, payload, signal);

      expect(mockConsoleError).toHaveBeenCalledTimes(1);
      const errorMsg = mockConsoleError.mock.calls[0][0];
      expect(errorMsg).toContain("Discord failed");
    });
  });
});
