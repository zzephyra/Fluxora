import { describe, expect, it } from "vitest";

import { referenceFromLocation } from "./reference-asset";

const asset = {
  id: "file-1",
  name: "fluxora.png",
  url: "https://cdn.example/fluxora.png",
  size: 1024,
  category: "image",
};

describe("reference location state", () => {
  it("reads a complete reference asset", () => {
    expect(referenceFromLocation({ referenceAsset: asset })).toEqual(asset);
  });

  it("drops incomplete or unsafe values", () => {
    expect(referenceFromLocation(null)).toBeNull();
    expect(referenceFromLocation({ referenceAsset: { ...asset, url: "javascript:alert(1)" } })).toBeNull();
    expect(referenceFromLocation({ referenceAsset: { ...asset, category: "audio" } })).toBeNull();
    expect(referenceFromLocation({ referenceAsset: { ...asset, size: -1 } })).toBeNull();
  });
});
