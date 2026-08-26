import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTrustedSender, readBackgroundRequest } from "../src/messages.js";

/**
 * The gate in front of the only context that holds a token.
 *
 * `chrome.runtime.onMessage` is a shared inbox, so these tests care about who
 * is allowed to be heard and what survives being parsed — particularly that an
 * invented `user_id` cannot ride along inside an otherwise valid record.
 */

const OWN_ORIGIN = "chrome-extension://this-extension/";

beforeEach(() => {
  vi.stubGlobal("chrome", {
    runtime: {
      id: "this-extension",
      getURL: (path: string) => `${OWN_ORIGIN}${path}`,
    },
  });
});

const record = {
  company: "IBM",
  job_title: "Analyst Intern",
  status: "Interested",
};

describe("who the background worker listens to", () => {
  it("accepts its own popup", () => {
    expect(
      isTrustedSender({ id: "this-extension", url: `${OWN_ORIGIN}popup.html` }),
    ).toBe(true);
  });

  it("refuses another extension", () => {
    expect(
      isTrustedSender({
        id: "some-other-extension",
        url: "chrome-extension://some-other-extension/popup.html",
      }),
    ).toBe(false);
  });

  it("refuses a content script, which shares the extension's own id", () => {
    expect(
      isTrustedSender({
        id: "this-extension",
        url: "https://jobs.example.com/posting/1",
        tab: { id: 4 },
      }),
    ).toBe(false);
  });

  it("refuses a sender whose document the browser could not name", () => {
    expect(isTrustedSender({ id: "this-extension" })).toBe(false);
  });

  it("refuses an origin that merely starts with the extension's id", () => {
    expect(
      isTrustedSender({
        id: "this-extension",
        url: "https://this-extension.example.com/",
      }),
    ).toBe(false);
  });
});

describe("what the background worker will act on", () => {
  it.each(["connection-state", "connect", "disconnect"])(
    "accepts the %s request",
    (type) => {
      expect(readBackgroundRequest({ type })).toEqual({ type });
    },
  );

  it.each([
    ["nothing", undefined],
    ["a string", "capture"],
    ["an unknown type", { type: "read-tokens" }],
    ["a capture with no record", { type: "capture" }],
    ["a capture with no company", { type: "capture", record: { job_title: "x", status: "Interested" } }],
    ["a capture with a status it does not offer", { type: "capture", record: { ...record, status: "Offer" } }],
  ])("refuses %s", (_label, message) => {
    expect(readBackgroundRequest(message)).toBeUndefined();
  });

  it("rebuilds a capture record field by field, dropping anything invented", () => {
    const request = readBackgroundRequest({
      type: "capture",
      record: {
        ...record,
        user_id: "00000000-0000-0000-0000-000000000000",
        location: "Ottawa, ON",
        nonsense: true,
      },
    });

    expect(request).toEqual({
      type: "capture",
      record: { ...record, location: "Ottawa, ON" },
    });
    expect(request?.type === "capture" && request.record).not.toHaveProperty(
      "user_id",
    );
  });

  it("drops a field that is longer than the record contract allows", () => {
    const request = readBackgroundRequest({
      type: "capture",
      record: { ...record, salary: "x".repeat(101) },
    });

    expect(request?.type === "capture" && request.record.salary).toBeUndefined();
  });
});
