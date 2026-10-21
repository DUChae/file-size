// 재인코딩 없이 JPEG·PNG·WebP 바이트에서 EXIF·XMP·IPTC 등 메타데이터 구간만 잘라낸다

// Used when re-encoding would make the file larger than the original: the pixels stay
// byte-for-byte identical, only the metadata segments go. Orientation is the one tag that
// changes how the image looks, so it is written back as a minimal EXIF block.

const EXIF_HEADER = Buffer.from("Exif\0\0", "binary");

// Big-endian TIFF block holding a single IFD0 entry: Orientation (0x0112, SHORT).
function orientationTiff(orientation: number) {
  const tiff = Buffer.alloc(26);
  tiff.write("MM", 0, "binary");
  tiff.writeUInt16BE(42, 2);
  tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8);
  tiff.writeUInt16BE(0x0112, 10);
  tiff.writeUInt16BE(3, 12);
  tiff.writeUInt32BE(1, 14);
  tiff.writeUInt16BE(orientation, 18);
  tiff.writeUInt32BE(0, 22);
  return tiff;
}

function stripJpeg(input: Buffer, orientation: number) {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;

  const parts: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;
  let wroteOrientation = orientation <= 1;

  const writeOrientation = () => {
    if (wroteOrientation) return;
    const payload = Buffer.concat([EXIF_HEADER, orientationTiff(orientation)]);
    const header = Buffer.alloc(4);
    header.writeUInt16BE(0xffe1, 0);
    header.writeUInt16BE(payload.length + 2, 2);
    parts.push(header, payload);
    wroteOrientation = true;
  };

  // EOI sits in the last two bytes, so the loop only requires a marker to be present.
  while (offset + 2 <= input.length) {
    if (input[offset] !== 0xff) return null;
    const marker = input[offset + 1];
    // Fill bytes between segments are allowed.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Standalone markers (TEM, RST0-7) have no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (marker === 0xd9) {
      // EOI. Anything after it (e.g. MPF gain maps, appended thumbnails) can carry its own
      // EXIF, so it is dropped together with the MPF index that points at it.
      parts.push(input.subarray(offset, offset + 2));
      return Buffer.concat(parts);
    }

    if (offset + 4 > input.length) return null;
    const length = input.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > input.length) return null;
    const segment = input.subarray(offset, end);
    const payload = input.subarray(offset + 4, end);

    const isApp0 = marker === 0xe0;
    const isIcc =
      marker === 0xe2 && payload.subarray(0, 12).toString("binary") === "ICC_PROFILE\0";
    const isAdobe = marker === 0xee;
    // APP1 (EXIF/XMP), APP3-APP13 (incl. IPTC in APP13), APP14 except Adobe color info,
    // APP15, COM, and APP2 other than ICC (MPF, FlashPix) are all metadata.
    const isMetadata =
      (marker >= 0xe1 && marker <= 0xef && !isIcc && !isAdobe) || marker === 0xfe;

    if (!isApp0) writeOrientation();
    if (!isMetadata) parts.push(segment);
    offset = end;

    if (marker === 0xda) {
      // Entropy-coded scan data: runs until the next marker that is not a stuffed 0xFF00
      // or a restart marker (RST0-7). Progressive files have several scans.
      let scanEnd = offset;
      while (scanEnd + 1 < input.length) {
        if (input[scanEnd] === 0xff) {
          const next = input[scanEnd + 1];
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
        }
        scanEnd += 1;
      }
      if (scanEnd + 1 >= input.length) return null;
      parts.push(input.subarray(offset, scanEnd));
      offset = scanEnd;
    }
  }

  return null;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Text chunks hold XMP (iTXt "XML:com.adobe.xmp"), comments, authors and software tags.
const PNG_METADATA_CHUNKS = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(input: Buffer, orientation: number) {
  if (input.length < 8 || !input.subarray(0, 8).equals(PNG_SIGNATURE)) return null;

  const parts: Buffer[] = [PNG_SIGNATURE];
  let offset = 8;
  let wroteOrientation = orientation <= 1;

  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.subarray(offset + 4, offset + 8).toString("binary");
    const end = offset + 12 + length;
    if (end > input.length) return null;

    // eXIf must precede the image data.
    if (!wroteOrientation && type === "IDAT") {
      const typeAndData = Buffer.concat([
        Buffer.from("eXIf", "binary"),
        orientationTiff(orientation),
      ]);
      const header = Buffer.alloc(4);
      header.writeUInt32BE(typeAndData.length - 4, 0);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(typeAndData), 0);
      parts.push(header, typeAndData, crc);
      wroteOrientation = true;
    }

    if (!PNG_METADATA_CHUNKS.has(type)) parts.push(input.subarray(offset, end));
    offset = end;
    if (type === "IEND") return Buffer.concat(parts);
  }

  return null;
}

const VP8X_FLAG_EXIF = 0x08;
const VP8X_FLAG_XMP = 0x04;

function stripWebp(input: Buffer, orientation: number) {
  if (
    input.length < 12 ||
    input.subarray(0, 4).toString("binary") !== "RIFF" ||
    input.subarray(8, 12).toString("binary") !== "WEBP"
  ) {
    return null;
  }

  const chunks: Buffer[] = [];
  let vp8x: Buffer | null = null;
  let offset = 12;

  while (offset + 8 <= input.length) {
    const fourcc = input.subarray(offset, offset + 4).toString("binary");
    const size = input.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > input.length) return null;
    const chunk = Buffer.from(input.subarray(offset, Math.min(end, input.length)));

    if (fourcc === "VP8X") vp8x = chunk;
    if (fourcc !== "EXIF" && fourcc !== "XMP ") chunks.push(chunk);
    offset = end;
  }

  // Simple (non-VP8X) WebP files cannot carry metadata, so there is nothing to strip.
  if (vp8x) {
    vp8x[8] &= ~(VP8X_FLAG_EXIF | VP8X_FLAG_XMP);
    if (orientation > 1) {
      const tiff = orientationTiff(orientation);
      const header = Buffer.alloc(8);
      header.write("EXIF", 0, "binary");
      header.writeUInt32LE(tiff.length, 4);
      chunks.push(header, tiff);
      vp8x[8] |= VP8X_FLAG_EXIF;
    }
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, "binary");
  header.writeUInt32LE(body.length + 4, 4);
  header.write("WEBP", 8, "binary");
  return Buffer.concat([header, body]);
}

// Returns null for formats it does not handle (AVIF, GIF, ...) or files it cannot parse.
export function stripMetadataLossless(
  input: Buffer,
  mimeType: string,
  orientation = 1,
): Buffer | null {
  try {
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
      return stripJpeg(input, orientation);
    }
    if (mimeType === "image/png") return stripPng(input, orientation);
    if (mimeType === "image/webp") return stripWebp(input, orientation);
  } catch {
    // Malformed structure; the caller falls back to the re-encoded output.
  }
  return null;
}
