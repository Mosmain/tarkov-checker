import { describe, it, expect } from "vitest";
import { parseScreenshotFilename } from "@shared/parse-screenshot";

describe("parseScreenshotFilename", () => {
  it("extracts XYZ from a typical Tarkov F12 screenshot name", () => {
    const result = parseScreenshotFilename(
      "2024-04-12[12-34-56]_-15.4, 1.5, -23.8_-0.1, 0.7, -0.0, 0.7_75 (0).png",
    );
    expect(result).toEqual({ x: -15.4, y: 1.5, z: -23.8 });
  });

  it("works with a full Windows path", () => {
    const result = parseScreenshotFilename(
      "C:\\Users\\mosma\\Documents\\Escape from Tarkov\\Screenshots\\2024-04-12[12-34-56]_200.5, 1.5, -100.0_0,0,0,1_75 (0).png",
    );
    expect(result).toEqual({ x: 200.5, y: 1.5, z: -100.0 });
  });

  it("returns null for non-png files", () => {
    expect(
      parseScreenshotFilename("2024-04-12[12-34-56]_15.4, 1.5, -23.8_0,0,0,1_75 (0).jpg"),
    ).toBeNull();
  });

  it("returns null when no position triple is present", () => {
    expect(parseScreenshotFilename("vacation 2024.png")).toBeNull();
  });

  it("handles integer-only coordinates", () => {
    const result = parseScreenshotFilename(
      "2024-04-12[12-34-56]_10, -5, 100_0,0,0,1_75 (0).png",
    );
    expect(result).toEqual({ x: 10, y: -5, z: 100 });
  });
});
