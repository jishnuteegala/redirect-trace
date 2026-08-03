import { describe, expect, it } from "vitest";
import { nodeRequirementMessage, supportsNode18 } from "../src/preflight.js";

describe("Node preflight", () => {
  it("requires Node 18 or newer", () => {
    expect(supportsNode18("16.20.2")).toBe(false);
    expect(supportsNode18("18.0.0")).toBe(true);
    expect(supportsNode18("24.1.0")).toBe(true);
  });

  it("builds an actionable requirement message", () => {
    expect(nodeRequirementMessage("16.20.2")).toBe(
      "redirect-trace requires Node 18 or newer; you are running v16.20.2. Upgrade: https://nodejs.org",
    );
  });
});
