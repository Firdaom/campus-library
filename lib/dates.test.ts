import { describe, expect, it } from "vitest";
import { toBangkokDateString } from "./dates";

describe("toBangkokDateString", () => {
  it("uses the Bangkok date when UTC is still on the previous day", () => {
    expect(toBangkokDateString(new Date("2026-01-01T17:00:00.000Z"))).toBe("2026-01-02");
  });

  it("keeps the previous Bangkok date before the UTC+7 boundary", () => {
    expect(toBangkokDateString(new Date("2026-01-01T16:59:59.999Z"))).toBe("2026-01-01");
  });

  it("preserves the date for times well inside the Bangkok day", () => {
    expect(toBangkokDateString(new Date("2026-06-15T08:30:00.000Z"))).toBe("2026-06-15");
  });
});
