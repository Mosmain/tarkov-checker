import { describe, it, expect } from "vitest";
import { mapDisplayName } from "@shared/maps";

describe("placeholder", () => {
  it("resolves bigmap to Customs", () => {
    expect(mapDisplayName("bigmap")).toBe("Customs");
  });
});
