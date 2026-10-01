import { describe, expect, it } from "vitest";

import { crossedWorkspaceBoundary } from "./upload-config";

describe("workspace drag boundary", () => {
  it("ignores movement between children", () => {
    const parent = document.createElement("section");
    const child = document.createElement("div");
    parent.append(child);
    expect(crossedWorkspaceBoundary(parent, child)).toBe(false);
    expect(crossedWorkspaceBoundary(parent, document.body)).toBe(true);
  });
});
