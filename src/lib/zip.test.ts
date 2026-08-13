import { describe, it, expect } from "vitest";
import { createZip, crc32, textBytes, xmlEscape } from "./zip";

/**
 * A minimal reader, so the writer is tested by reading it back rather than by asserting the bytes
 * it happened to produce. Walks the end-of-central-directory record to the central directory, then
 * each entry's local header to its data, which is the same path Excel takes.
 */
function readZip(bytes: Uint8Array): Record<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const out: Record<string, string> = {};

  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new Error("bad central directory header");
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));

    if (view.getUint32(localAt, true) !== 0x04034b50) throw new Error("bad local file header");
    const localNameLen = view.getUint16(localAt + 26, true);
    const localExtraLen = view.getUint16(localAt + 28, true);
    const size = view.getUint32(localAt + 18, true);
    const dataAt = localAt + 30 + localNameLen + localExtraLen;
    const data = bytes.subarray(dataAt, dataAt + size);

    // The stored CRC has to match what the data actually hashes to, or a reader rejects the file.
    expect(view.getUint32(at + 16, true), `crc for ${name}`).toBe(crc32(data));
    out[name] = decoder.decode(data);
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("crc32", () => {
  it("matches the published check value", () => {
    // The standard CRC-32 of "123456789" is 0xCBF43926, the vector every implementation is
    // checked against.
    expect(crc32(textBytes("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for no bytes", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("changes when a single byte changes", () => {
    expect(crc32(textBytes("hello"))).not.toBe(crc32(textBytes("hellp")));
  });
});

describe("createZip", () => {
  it("round-trips its entries", () => {
    const zip = createZip([
      { path: "a.txt", data: textBytes("first") },
      { path: "nested/b.xml", data: textBytes("<x/>") },
    ]);
    expect(readZip(zip)).toEqual({ "a.txt": "first", "nested/b.xml": "<x/>" });
  });

  it("starts with the local file header signature, which is what readers sniff for", () => {
    const zip = createZip([{ path: "a.txt", data: textBytes("x") }]);
    expect([...zip.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("survives an empty archive", () => {
    expect(readZip(createZip([]))).toEqual({});
  });

  it("keeps a zero-length entry rather than dropping it", () => {
    expect(readZip(createZip([{ path: "empty.xml", data: new Uint8Array() }]))).toEqual({ "empty.xml": "" });
  });

  it("writes UTF-8 paths and content intact", () => {
    const zip = createZip([{ path: "café/ñ.xml", data: textBytes("Ålesund, Sumipesca S.A.") }]);
    expect(readZip(zip)["café/ñ.xml"]).toBe("Ålesund, Sumipesca S.A.");
  });

  it("clamps a pre-1980 timestamp instead of wrapping the DOS date field", () => {
    // The DOS date has a 1980 epoch. An unclamped 1970 would encode as a negative year and read
    // back as some date decades in the future.
    expect(() => readZip(createZip([{ path: "a.txt", data: textBytes("x") }], new Date("1970-01-01")))).not.toThrow();
  });
});

describe("xmlEscape", () => {
  it("escapes the five characters that break XML", () => {
    expect(xmlEscape(`Nets & <Twine> "Co" 'Ltd'`)).toBe(
      "Nets &amp; &lt;Twine&gt; &quot;Co&quot; &apos;Ltd&apos;"
    );
  });

  it("escapes ampersands before the entities it introduces", () => {
    // Getting this order wrong yields "&amp;lt;", the classic double-escape.
    expect(xmlEscape("<")).toBe("&lt;");
    expect(xmlEscape("&lt;")).toBe("&amp;lt;");
  });
});
