import { describe, it, expect } from "vitest";
import { formatError } from "@/lib/errors/format";

describe("formatError", () => {
  it("returns Error.message", () => {
    expect(formatError(new Error("boom"))).toBe("boom");
  });
  it("returns string itself", () => {
    expect(formatError("oops")).toBe("oops");
  });
  it("stringifies plain objects with a message field", () => {
    expect(formatError({ message: "rate limited" })).toBe("rate limited");
  });
  it("falls back to String() for unknown shapes", () => {
    expect(formatError(42)).toBe("42");
    expect(formatError(null)).toBe("null");
    expect(formatError(undefined)).toBe("undefined");
  });
});
