import { describe, expect, it } from "vitest";
import { appUrl, normalizeOrigin } from "./stripe";

describe("normalizeOrigin", () => {
  it("adds https when the scheme is missing", () => {
    expect(normalizeOrigin("repsapp.fit")).toBe("https://repsapp.fit");
  });

  it("strips a trailing slash", () => {
    expect(normalizeOrigin("https://repsapp.fit/")).toBe("https://repsapp.fit");
  });

  it("upgrades http to https off localhost", () => {
    expect(normalizeOrigin("http://repsapp.fit")).toBe("https://repsapp.fit");
  });

  it("keeps http://localhost for local Stripe test mode", () => {
    expect(normalizeOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000"
    );
  });

  it("rejects empty and internal hosts", () => {
    expect(normalizeOrigin("")).toBeNull();
    expect(normalizeOrigin("http://0.0.0.0:3000")).toBeNull();
  });
});

describe("appUrl", () => {
  it("prefers NEXT_PUBLIC_APP_URL even without a scheme", () => {
    const request = new Request("http://localhost:3000/api/stripe/checkout");
    expect(
      appUrl(request, { NEXT_PUBLIC_APP_URL: "repsapp.fit" })
    ).toBe("https://repsapp.fit");
  });

  it("uses forwarded host/proto when the env var is unset", () => {
    const request = new Request("http://localhost:3000/api/stripe/checkout", {
      headers: {
        "x-forwarded-host": "repsapp.fit",
        "x-forwarded-proto": "https",
      },
    });
    expect(appUrl(request, {})).toBe("https://repsapp.fit");
  });

  it("does not send Stripe an internal localhost origin in production", () => {
    const request = new Request("http://localhost:3000/api/stripe/checkout", {
      headers: {
        host: "repsapp.fit",
        "x-forwarded-proto": "https",
      },
    });
    expect(appUrl(request, {})).toBe("https://repsapp.fit");
  });

  it("treats localhost with a port as local", () => {
    expect(
      appUrl(
        new Request("http://127.0.0.1/api/stripe/checkout", {
          headers: {
            host: "localhost:3000",
            "x-forwarded-proto": "http",
          },
        }),
        {}
      )
    ).toBe("http://localhost:3000");
  });
});
