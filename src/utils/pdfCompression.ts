import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from "pdf-lib";
import {
  PDFJS_DOCUMENT_OPTIONS,
  canvasToBlob,
  getSafeRenderScale,
  loadPdfjs,
  releaseCanvas,
} from "@/lib/pdfjs";

export type PdfCompressionMode = "standard" | "strong";

export interface PdfCompressionOptions {
  mode: PdfCompressionMode;
  // 1-100, shared with the image compression slider.
  quality: number;
  // Longest image side in px for standard mode; 0 keeps the original resolution.
  maxImageSide: number;
  // Render resolution for strong mode.
  rasterDpi: number;
  onProgress?: (done: number, total: number) => void;
}

export interface PdfCompressionResult {
  bytes: Uint8Array;
  originalSize: number;
  compressedSize: number;
  pageCount: number;
  imagesTotal: number;
  imagesRecompressed: number;
  imagesSkipped: number;
}

const MIN_IMAGE_SIDE = 64;
const MIN_IMAGE_BYTES = 8 * 1024;

const N = {
  Subtype: PDFName.of("Subtype"),
  Image: PDFName.of("Image"),
  Filter: PDFName.of("Filter"),
  DecodeParms: PDFName.of("DecodeParms"),
  Decode: PDFName.of("Decode"),
  ColorSpace: PDFName.of("ColorSpace"),
  BitsPerComponent: PDFName.of("BitsPerComponent"),
  Width: PDFName.of("Width"),
  Height: PDFName.of("Height"),
  Mask: PDFName.of("Mask"),
  SMask: PDFName.of("SMask"),
  ImageMask: PDFName.of("ImageMask"),
  Predictor: PDFName.of("Predictor"),
  DCTDecode: PDFName.of("DCTDecode"),
  FlateDecode: PDFName.of("FlateDecode"),
  DeviceRGB: PDFName.of("DeviceRGB"),
  DeviceGray: PDFName.of("DeviceGray"),
  ICCBased: PDFName.of("ICCBased"),
  Thumb: PDFName.of("Thumb"),
  N: PDFName.of("N"),
};

const yieldToBrowser = () => new Promise((resolve) => setTimeout(resolve, 0));

function getSingleFilter(dict: PDFDict) {
  const filter = dict.lookup(N.Filter);
  if (filter instanceof PDFName) return filter;
  if (filter instanceof PDFArray && filter.size() === 1) {
    const only = filter.lookup(0);
    return only instanceof PDFName ? only : undefined;
  }
  return undefined;
}

// Returns 1 (gray) or 3 (RGB) for color spaces we can safely re-encode, otherwise null.
function getComponentCount(dict: PDFDict) {
  const colorSpace = dict.lookup(N.ColorSpace);
  if (colorSpace === N.DeviceRGB) return 3;
  if (colorSpace === N.DeviceGray) return 1;
  if (colorSpace instanceof PDFArray && colorSpace.lookup(0) === N.ICCBased) {
    const profile = colorSpace.lookup(1);
    const dictOfProfile =
      profile instanceof PDFRawStream ? profile.dict : undefined;
    const components = dictOfProfile?.lookup(N.N);
    if (components instanceof PDFNumber) {
      const n = components.asNumber();
      if (n === 1 || n === 3) return n;
    }
  }
  return null;
}

function hasPredictor(dict: PDFDict) {
  const parms = dict.lookup(N.DecodeParms);
  const parmsDict =
    parms instanceof PDFDict
      ? parms
      : parms instanceof PDFArray
        ? parms.lookup(0)
        : undefined;
  if (!(parmsDict instanceof PDFDict)) return false;
  const predictor = parmsDict.lookup(N.Predictor);
  return predictor instanceof PDFNumber && predictor.asNumber() > 1;
}

async function decodeToBitmap(
  stream: PDFRawStream,
  filter: PDFName,
  width: number,
  height: number,
  components: number,
): Promise<ImageBitmap | null> {
  if (filter === N.DCTDecode) {
    const blob = new Blob([stream.contents as Uint8Array<ArrayBuffer>], {
      type: "image/jpeg",
    });
    return createImageBitmap(blob);
  }

  const raw = decodePDFRawStream(stream).decode();
  if (raw.length < width * height * components) return null;

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i += 1, p += components) {
    const o = i * 4;
    if (components === 1) {
      rgba[o] = rgba[o + 1] = rgba[o + 2] = raw[p];
    } else {
      rgba[o] = raw[p];
      rgba[o + 1] = raw[p + 1];
      rgba[o + 2] = raw[p + 2];
    }
    rgba[o + 3] = 255;
  }
  return createImageBitmap(new ImageData(rgba, width, height));
}

async function recompressImage(
  doc: PDFDocument,
  ref: PDFRef,
  stream: PDFRawStream,
  options: PdfCompressionOptions,
  canvas: HTMLCanvasElement,
): Promise<boolean> {
  const dict = stream.dict;
  const filter = getSingleFilter(dict);
  const width = (dict.lookup(N.Width) as PDFNumber | undefined)?.asNumber();
  const height = (dict.lookup(N.Height) as PDFNumber | undefined)?.asNumber();
  const bits = (
    dict.lookup(N.BitsPerComponent) as PDFNumber | undefined
  )?.asNumber();
  const components = getComponentCount(dict);

  // Only touch image types whose decoding we fully understand; everything else is left as-is.
  if (
    !filter ||
    (filter !== N.DCTDecode && filter !== N.FlateDecode) ||
    !width ||
    !height ||
    bits !== 8 ||
    components === null ||
    dict.has(N.Mask) ||
    dict.has(N.Decode) ||
    dict.has(N.ImageMask) ||
    hasPredictor(dict) ||
    Math.max(width, height) < MIN_IMAGE_SIDE ||
    stream.contents.length < MIN_IMAGE_BYTES
  ) {
    return false;
  }

  const bitmap = await decodeToBitmap(stream, filter, width, height, components);
  if (!bitmap) return false;

  // Soft masks keep their own resolution, so only lower quality for those images.
  const canDownscale = !dict.has(N.SMask) && options.maxImageSide > 0;
  const longSide = Math.max(width, height);
  const ratio =
    canDownscale && longSide > options.maxImageSide
      ? options.maxImageSide / longSide
      : 1;
  const targetWidth = Math.max(1, Math.round(width * ratio));
  const targetHeight = Math.max(1, Math.round(height * ratio));

  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return false;
  }
  context.fillStyle = "#fff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const jpeg = await canvasToBlob(canvas, "image/jpeg", options.quality / 100);
  const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
  if (jpegBytes.length >= stream.contents.length) return false;

  const newDict = dict.clone(doc.context);
  newDict.set(N.Filter, N.DCTDecode);
  newDict.set(N.Width, PDFNumber.of(targetWidth));
  newDict.set(N.Height, PDFNumber.of(targetHeight));
  newDict.set(N.ColorSpace, N.DeviceRGB);
  newDict.set(N.BitsPerComponent, PDFNumber.of(8));
  newDict.delete(N.DecodeParms);
  doc.context.assign(ref, PDFRawStream.of(newDict, jpegBytes));
  return true;
}

async function compressStandard(
  bytes: ArrayBuffer,
  options: PdfCompressionOptions,
): Promise<Omit<PdfCompressionResult, "originalSize" | "compressedSize">> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });

  const images = doc.context
    .enumerateIndirectObjects()
    .filter(
      (entry): entry is [PDFRef, PDFRawStream] =>
        entry[1] instanceof PDFRawStream &&
        entry[1].dict.lookup(N.Subtype) === N.Image,
    );

  const canvas = document.createElement("canvas");
  let recompressed = 0;

  for (let index = 0; index < images.length; index += 1) {
    const [ref, stream] = images[index];
    try {
      if (await recompressImage(doc, ref, stream, options, canvas)) {
        recompressed += 1;
      }
    } catch {
      // Leave images we fail to decode untouched.
    }
    options.onProgress?.(index + 1, images.length);
    await yieldToBrowser();
  }
  releaseCanvas(canvas);

  doc.getPages().forEach((page) => page.node.delete(N.Thumb));

  return {
    bytes: await doc.save({ useObjectStreams: true }),
    pageCount: doc.getPageCount(),
    imagesTotal: images.length,
    imagesRecompressed: recompressed,
    imagesSkipped: images.length - recompressed,
  };
}

async function compressStrong(
  bytes: ArrayBuffer,
  options: PdfCompressionOptions,
): Promise<Omit<PdfCompressionResult, "originalSize" | "compressedSize">> {
  const pdfjs = await loadPdfjs();
  const source = await pdfjs.getDocument({
    data: bytes,
    ...PDFJS_DOCUMENT_OPTIONS,
  }).promise;

  try {
    const output = await PDFDocument.create();
    const canvas = document.createElement("canvas");

    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const page = await source.getPage(pageNumber);
      const pageSize = page.getViewport({ scale: 1 });
      const scale = getSafeRenderScale(
        pageSize.width,
        pageSize.height,
        options.rasterDpi / 72,
      );
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas context를 만들 수 없습니다.");

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;

      const jpeg = await canvasToBlob(canvas, "image/jpeg", options.quality / 100);
      const image = await output.embedJpg(await jpeg.arrayBuffer());
      const outputPage = output.addPage([pageSize.width, pageSize.height]);
      outputPage.drawImage(image, {
        x: 0,
        y: 0,
        width: pageSize.width,
        height: pageSize.height,
      });

      page.cleanup();
      options.onProgress?.(pageNumber, source.numPages);
    }
    releaseCanvas(canvas);

    return {
      bytes: await output.save({ useObjectStreams: true }),
      pageCount: source.numPages,
      imagesTotal: 0,
      imagesRecompressed: 0,
      imagesSkipped: 0,
    };
  } finally {
    await source.destroy();
  }
}

export async function compressPdf(
  file: File,
  options: PdfCompressionOptions,
): Promise<PdfCompressionResult> {
  const bytes = await file.arrayBuffer();
  const result =
    options.mode === "strong"
      ? await compressStrong(bytes, options)
      : await compressStandard(bytes, options);

  return {
    ...result,
    originalSize: file.size,
    compressedSize: result.bytes.length,
  };
}
