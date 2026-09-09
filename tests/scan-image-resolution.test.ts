import { describe, it, expect } from "vitest";
import sharp from "sharp";

// ─────────────────────────────────────────────────────────────────────────
// Tests for the progressive, quota-aware scan-image resolution logic
// (chooseScanResolution in lib/ai.ts, compressForVision in the
// scan-purchase-document route). Deliberately uses the REAL sharp module
// (no mocking) — this suite is specifically about actual pixel/ratio/EXIF
// behavior, which a mocked resize chain can't verify. Fixture images are
// generated in-memory with sharp itself, so no test assets are needed.
//
// chooseScanResolution() is tested directly with synthetic quota snapshots
// (a pure function, no image I/O). compressForVision() is tested with a
// `resolutionOverride` argument so each resize scenario is self-contained
// and doesn't depend on (or mutate) the module-level "last known Groq
// quota" state that production call sites read implicitly.
// ─────────────────────────────────────────────────────────────────────────

import { chooseScanResolution, MAX_SCAN_IMAGE_SIZE, SCAN_JPEG_QUALITY_DEFAULT, SCAN_IMAGE_SIZE_LOW_QUOTA, SCAN_JPEG_QUALITY_LOW_QUOTA, SCAN_IMAGE_SIZE_VERY_LOW_QUOTA } from "@/lib/ai";
import { compressForVision } from "@/app/api/ai/scan-purchase-document/route";

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 60, b: 30 } } })
    .jpeg()
    .toBuffer();
}

// ───────────────────────── chooseScanResolution (pure) ─────────────────────────

describe("chooseScanResolution", () => {
  it("falls back to the normal 1400/82 behavior when no quota snapshot is available", () => {
    const choice = chooseScanResolution(null);
    expect(choice).toEqual({ maxSize: MAX_SCAN_IMAGE_SIZE, quality: SCAN_JPEG_QUALITY_DEFAULT, tier: "unknown" });
  });

  it("stays at 1400/82 when the Groq quota is comfortable", () => {
    const choice = chooseScanResolution({
      remainingTokens: 6000, limitTokens: 8000, remainingRequests: null, limitRequests: null, observedAt: "now",
    });
    expect(choice).toEqual({ maxSize: MAX_SCAN_IMAGE_SIZE, quality: SCAN_JPEG_QUALITY_DEFAULT, tier: "comfortable" });
  });

  it("drops to 1200/80 when the quota is low", () => {
    const choice = chooseScanResolution({
      remainingTokens: 2000, limitTokens: 8000, remainingRequests: null, limitRequests: null, observedAt: "now",
    });
    expect(choice).toEqual({ maxSize: SCAN_IMAGE_SIZE_LOW_QUOTA, quality: SCAN_JPEG_QUALITY_LOW_QUOTA, tier: "low" });
  });

  it("drops to 1100/80 when the quota is very low but not critical", () => {
    const choice = chooseScanResolution({
      remainingTokens: 800, limitTokens: 8000, remainingRequests: null, limitRequests: null, observedAt: "now",
    });
    expect(choice).toEqual({ maxSize: SCAN_IMAGE_SIZE_VERY_LOW_QUOTA, quality: 80, tier: "very-low" });
  });

  it("drops quality further to 78 when the quota is critically low", () => {
    const choice = chooseScanResolution({
      remainingTokens: 200, limitTokens: 8000, remainingRequests: null, limitRequests: null, observedAt: "now",
    });
    expect(choice).toEqual({ maxSize: SCAN_IMAGE_SIZE_VERY_LOW_QUOTA, quality: 78, tier: "very-low" });
  });
});

// ───────────────────────── compressForVision (real sharp) ─────────────────────────

describe("compressForVision — no reduction below the cap", () => {
  it("leaves an 800px image untouched (no override → default 1400 cap)", async () => {
    const buf = await makeJpeg(800, 600);
    const { stats } = await compressForVision(buf);
    expect(stats.sentWidthPx).toBe(800);
    expect(stats.sentHeightPx).toBe(600);
    expect(stats.quotaTier).toBe("unknown");
  });

  it("leaves a 1400px image untouched (exactly at the normal cap)", async () => {
    const buf = await makeJpeg(1400, 933);
    const { stats } = await compressForVision(buf);
    expect(stats.sentWidthPx).toBe(1400);
    expect(stats.sentHeightPx).toBe(933);
  });

  it("never enlarges a small image even under a very-low-quota override", async () => {
    const buf = await makeJpeg(600, 400);
    const { stats } = await compressForVision(buf, { maxSize: SCAN_IMAGE_SIZE_VERY_LOW_QUOTA, quality: 78, tier: "very-low" });
    expect(stats.sentWidthPx).toBe(600);
    expect(stats.sentHeightPx).toBe(400);
  });
});

describe("compressForVision — reduction in normal mode", () => {
  it("reduces a 2000px image down to 1400px in normal mode", async () => {
    const buf = await makeJpeg(2000, 1500);
    const { stats } = await compressForVision(buf);
    expect(stats.maxSizeUsed).toBe(MAX_SCAN_IMAGE_SIZE);
    expect(stats.qualityUsed).toBe(SCAN_JPEG_QUALITY_DEFAULT);
    expect(stats.sentWidthPx).toBe(1400);
    expect(stats.sentHeightPx).toBe(1050);
  });
});

describe("compressForVision — quota-driven reduction", () => {
  it("caps a 2000px image at 1200px when the quota is low", async () => {
    const buf = await makeJpeg(2000, 1500);
    const { stats } = await compressForVision(buf, { maxSize: SCAN_IMAGE_SIZE_LOW_QUOTA, quality: SCAN_JPEG_QUALITY_LOW_QUOTA, tier: "low" });
    expect(stats.sentWidthPx).toBe(1200);
    expect(stats.sentHeightPx).toBe(900);
    expect(stats.quotaTier).toBe("low");
  });

  it("caps a 2000px image at 1100px when the quota is very low", async () => {
    const buf = await makeJpeg(2000, 1500);
    const { stats } = await compressForVision(buf, { maxSize: SCAN_IMAGE_SIZE_VERY_LOW_QUOTA, quality: 78, tier: "very-low" });
    expect(stats.sentWidthPx).toBe(1100);
    expect(stats.sentHeightPx).toBe(825);
    expect(stats.quotaTier).toBe("very-low");
  });
});

describe("compressForVision — aspect ratio is always preserved", () => {
  it("keeps the original ratio after resizing at every tier", async () => {
    const buf = await makeJpeg(2000, 1500); // 4:3
    const originalRatio = 2000 / 1500;
    for (const override of [
      undefined,
      { maxSize: SCAN_IMAGE_SIZE_LOW_QUOTA, quality: SCAN_JPEG_QUALITY_LOW_QUOTA, tier: "low" as const },
      { maxSize: SCAN_IMAGE_SIZE_VERY_LOW_QUOTA, quality: 78, tier: "very-low" as const },
    ]) {
      const { stats } = await compressForVision(buf, override);
      const sentRatio = (stats.sentWidthPx as number) / (stats.sentHeightPx as number);
      expect(sentRatio).toBeCloseTo(originalRatio, 2);
    }
  });
});

describe("compressForVision — EXIF rotation", () => {
  it("applies EXIF orientation before resizing, so a sideways photo comes out right-side up", async () => {
    // Orientation 6 = "rotate 90° CW to display correctly": the file's raw
    // stored pixels are landscape (300x150), but the intended/display
    // orientation is portrait (150x300). sharp's real orientation-6 handling
    // was verified directly against this sharp install before writing this
    // test (raw metadata reports 300x150 + orientation 6; after .rotate()
    // the output is 150x300 with the EXIF tag stripped).
    const raw = await sharp({ create: { width: 300, height: 150, channels: 3, background: { r: 10, g: 200, b: 10 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const rawMeta = await sharp(raw).metadata();
    expect(rawMeta.width).toBe(300);
    expect(rawMeta.height).toBe(150);
    expect(rawMeta.orientation).toBe(6);

    const { stats } = await compressForVision(raw);
    // originalWidthPx/Height report the raw stored (pre-rotation) dimensions —
    // this is what sharp's own metadata() call reports, matching what the
    // Admin diagnostic panel shows as "Original".
    expect(stats.originalWidthPx).toBe(300);
    expect(stats.originalHeightPx).toBe(150);
    // sentWidthPx/Height report the orientation-corrected, resized result —
    // swapped to portrait, proving the EXIF tag was actually applied rather
    // than ignored.
    expect(stats.sentWidthPx).toBe(150);
    expect(stats.sentHeightPx).toBe(300);
  });
});
