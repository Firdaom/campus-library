import { describe, expect, it } from "vitest";
import { loanBodySchema, reservationBodySchema } from "./apiSchemas";

const copyId = "11111111-1111-4111-8111-111111111111";
const resourceId = "22222222-2222-4222-8222-222222222222";

describe("loanBodySchema", () => {
  it("accepts a request for a specific copy", () => {
    expect(loanBodySchema.safeParse({ copy_id: copyId }).success).toBe(true);
  });

  it("accepts a request for any available copy of a resource", () => {
    expect(loanBodySchema.safeParse({ resource_id: resourceId }).success).toBe(true);
  });

  it("requires exactly one of copy_id and resource_id", () => {
    expect(loanBodySchema.safeParse({}).success).toBe(false);
    expect(
      loanBodySchema.safeParse({ copy_id: copyId, resource_id: resourceId }).success
    ).toBe(false);
  });

  it("rejects malformed copy and borrower IDs", () => {
    expect(loanBodySchema.safeParse({ copy_id: "not-a-uuid" }).success).toBe(false);
    expect(
      loanBodySchema.safeParse({ copy_id: copyId, user_id: "not-a-uuid" }).success
    ).toBe(false);
  });
});

describe("reservationBodySchema", () => {
  it("accepts a resource UUID", () => {
    expect(reservationBodySchema.safeParse({ resource_id: resourceId }).success).toBe(true);
  });

  it("rejects a missing or malformed resource UUID", () => {
    expect(reservationBodySchema.safeParse({}).success).toBe(false);
    expect(
      reservationBodySchema.safeParse({ resource_id: "not-a-uuid" }).success
    ).toBe(false);
  });
});
