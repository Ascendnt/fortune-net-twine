/**
 * A minimal ZIP container, written by hand.
 *
 * This exists so the app can produce real `.xlsx` and `.pptx` files. Both formats are just a ZIP
 * of XML parts, so a ZIP writer is the whole gap between "download a CSV" and "download the
 * workbook and the deck the client actually circulates".
 *
 * Written rather than installed for two reasons. The obvious one is weight: the usual libraries
 * are hundreds of kilobytes to produce a file this app assembles in a few hundred lines. The real
 * one is that the alternative was worse: without it, the monthly pack has to be rebuilt by hand in
 * Excel and PowerPoint every month from data the system already holds, which is the work this is
 * supposed to remove.
 *
 * Entries are STORED, never deflated. Compression would need DEFLATE, which is either a second
 * hand-written chunk of code to get wrong or `CompressionStream`, which is async and not on every
 * browser the office runs. A month's report pack is a few hundred kilobytes uncompressed and is
 * being saved to a local disk, so the trade is entirely one-sided. Excel, PowerPoint, LibreOffice and
 * every unzip tool read stored entries without complaint.
 */

/** One file inside the archive. Paths use forward slashes and no leading slash. */
export interface ZipEntry {
  path: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();

export function textBytes(s: string): Uint8Array {
  return encoder.encode(s);
}

/**
 * MS-DOS date and time, which is what the ZIP header carries.
 *
 * Two-second resolution and a 1980 epoch, both of which are the format's, not ours. A file stamped
 * before 1980 is clamped rather than allowed to wrap into a date in the future.
 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/** Little-endian writer over a growable buffer. Every ZIP field is little-endian. */
class ByteWriter {
  private chunks: Uint8Array[] = [];
  length = 0;

  bytes(b: Uint8Array) {
    this.chunks.push(b);
    this.length += b.length;
  }
  u16(v: number) {
    const b = new Uint8Array(2);
    new DataView(b.buffer).setUint16(0, v & 0xffff, true);
    this.bytes(b);
  }
  u32(v: number) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, v >>> 0, true);
    this.bytes(b);
  }
  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let at = 0;
    for (const c of this.chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}

/**
 * Builds the archive.
 *
 * Standard layout: a local header before each file, then a central directory repeating the same
 * metadata with the offset of each local header, then the end-of-central-directory record. Readers
 * work backwards from the EOCD, which is why the offsets have to be tracked as we go rather than
 * patched afterwards.
 */
export function createZip(entries: ZipEntry[], modified: Date = new Date()): Uint8Array {
  const { time, date } = dosDateTime(modified);
  const body = new ByteWriter();
  const directory = new ByteWriter();

  for (const entry of entries) {
    const name = textBytes(entry.path);
    const crc = crc32(entry.data);
    const offset = body.length;

    body.u32(0x04034b50); // local file header
    body.u16(20); // version needed: 2.0
    body.u16(0x0800); // UTF-8 filenames
    body.u16(0); // stored
    body.u16(time);
    body.u16(date);
    body.u32(crc);
    body.u32(entry.data.length);
    body.u32(entry.data.length);
    body.u16(name.length);
    body.u16(0); // no extra field
    body.bytes(name);
    body.bytes(entry.data);

    directory.u32(0x02014b50); // central directory header
    directory.u16(20); // version made by
    directory.u16(20); // version needed
    directory.u16(0x0800);
    directory.u16(0);
    directory.u16(time);
    directory.u16(date);
    directory.u32(crc);
    directory.u32(entry.data.length);
    directory.u32(entry.data.length);
    directory.u16(name.length);
    directory.u16(0); // extra
    directory.u16(0); // comment
    directory.u16(0); // disk number
    directory.u16(0); // internal attributes
    directory.u32(0); // external attributes
    directory.u32(offset);
    directory.bytes(name);
  }

  const out = new ByteWriter();
  out.bytes(body.concat());
  const directoryOffset = out.length;
  out.bytes(directory.concat());

  out.u32(0x06054b50); // end of central directory
  out.u16(0); // this disk
  out.u16(0); // disk with the directory
  out.u16(entries.length);
  out.u16(entries.length);
  out.u32(directory.length);
  out.u32(directoryOffset);
  out.u16(0); // comment length
  return out.concat();
}

/** Escapes a string for use as XML text or an attribute value. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Hands the finished archive to the browser as a download.
 *
 * The object URL is revoked on a later tick: revoking it immediately cancels the download in some
 * browsers, which is the same reason the CSV helper waits.
 */
export function downloadBinary(filename: string, data: Uint8Array, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
