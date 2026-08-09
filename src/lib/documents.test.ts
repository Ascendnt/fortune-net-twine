import { describe, it, expect } from "vitest";
import {
  MAX_TOTAL_UPLOAD_BYTES,
  MAX_UPLOAD_BYTES,
  fileKind,
  formatBytes,
  validateUpload,
} from "./documents";

describe("formatBytes", () => {
  it("uses bytes below a kilobyte", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("switches to kilobytes at exactly 1024, not 1024 B", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("drops the decimal once the number is big enough not to need it", () => {
    expect(formatBytes(50 * 1024)).toBe("50 KB");
  });

  it("switches to megabytes at a megabyte", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB");
  });

  it("does not produce nonsense for a bad number", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(-5)).toBe("—");
  });
});

describe("validateUpload", () => {
  it("accepts a normal file", () => {
    expect(validateUpload({ sizeBytes: 200_000, name: "report.pdf", existingTotalBytes: 0 })).toBeNull();
  });

  it("refuses an empty file", () => {
    expect(validateUpload({ sizeBytes: 0, name: "blank.pdf", existingTotalBytes: 0 })).toContain("empty");
  });

  it("refuses a file over the per-file limit and says what to do about it", () => {
    const msg = validateUpload({ sizeBytes: MAX_UPLOAD_BYTES + 1, name: "scan.pdf", existingTotalBytes: 0 });
    expect(msg).toContain("scan.pdf");
    expect(msg).toContain("2.0 MB");
    expect(msg).toContain("compressed");
  });

  it("accepts a file sitting exactly on the per-file limit", () => {
    expect(validateUpload({ sizeBytes: MAX_UPLOAD_BYTES, name: "edge.pdf", existingTotalBytes: 0 })).toBeNull();
  });

  it("refuses when the order's attachments would exceed the total", () => {
    // A hundred small files fill the quota just as well as one large one.
    const msg = validateUpload({
      sizeBytes: 1_000_000,
      name: "one-more.pdf",
      existingTotalBytes: MAX_TOTAL_UPLOAD_BYTES,
    });
    expect(msg).toContain("Remove something");
  });

  it("accepts a file that lands exactly on the total limit", () => {
    expect(
      validateUpload({
        sizeBytes: 1000,
        name: "fits.pdf",
        existingTotalBytes: MAX_TOTAL_UPLOAD_BYTES - 1000,
      })
    ).toBeNull();
  });
});

describe("fileKind", () => {
  it("reads the extension", () => {
    expect(fileKind("packing-list.pdf")).toBe("PDF");
    expect(fileKind("photo.JPG")).toBe("JPG");
  });

  it("uses the last extension on a multi-dotted name", () => {
    expect(fileKind("report.final.v2.xlsx")).toBe("XLSX");
  });

  it("falls back when there is no extension at all", () => {
    expect(fileKind("README")).toBe("FILE");
  });
});
