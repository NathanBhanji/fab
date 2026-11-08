import { describe, expect, it } from "vite-plus/test";

import { isTransportConnectionErrorMessage, sanitizeThreadErrorMessage } from "./transport.ts";

describe("isTransportConnectionErrorMessage", () => {
  it("returns true for React Native disconnected socket errors", () => {
    expect(
      isTransportConnectionErrorMessage(
        "The operation couldn't be completed. Socket is not connected",
      ),
    ).toBe(true);
  });

  it("recognizes connection errors only without trailing text", () => {
    for (const sentence of [
      "Mac mini disconnected.",
      "Mac mini stopped responding.",
      "Mac mini could not establish a WebSocket connection.",
    ]) {
      expect(isTransportConnectionErrorMessage(sentence)).toBe(true);
    }
    expect(
      isTransportConnectionErrorMessage(
        "Your ChatGPT connection expired or was disconnected. Sign in again.",
      ),
    ).toBe(false);
  });
});

describe("sanitizeThreadErrorMessage", () => {
  it("strips transport errors", () => {
    expect(sanitizeThreadErrorMessage("SocketCloseError: oops")).toBeNull();
  });
});
