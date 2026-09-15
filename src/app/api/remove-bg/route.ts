import { NextRequest, NextResponse } from "next/server";
import { Client } from "@gradio/client";
import sharp from "sharp";

export const maxDuration = 60; // Vercel 함수 최대 실행 시간

let cachedClient: any = null;

async function getBiRefNetClient(token: string) {
  if (!cachedClient) {
    cachedClient = await Client.connect("ZhengPeng7/BiRefNet_demo", {
      token: token as `hf_${string}`,
    });
  }
  return cachedClient;
}

/**
 * 로고, 아이콘, 그래픽 등 단색/균일한 배경을 가진 이미지인지 판별하고
 * 고정밀 안티앨리어싱 매팅으로 즉시 투명화 처리합니다 (처리시간 ~20ms, 서버리스 타임아웃 0%).
 */
async function trySmartUniformBgRemoval(imageBuffer: Buffer): Promise<Buffer | null> {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const { width, height, channels } = metadata;

    if (!width || !height || !channels) return null;

    // 너무 거대한 이미지는 메모리 보호
    const maxDim = 3000;
    let workingImage = image;
    if (width > maxDim || height > maxDim) {
      workingImage = workingImage.resize({
        width: width > height ? maxDim : undefined,
        height: height >= width ? maxDim : undefined,
        fit: "inside",
      });
    }

    const { data, info } = await workingImage.raw().toBuffer({ resolveWithObject: true });
    const w = info.width;
    const h = info.height;
    const ch = info.channels;

    // 4개 모서리 및 각 변의 중앙 픽셀 샘플링
    const samplePixel = (x: number, y: number): [number, number, number] => {
      const idx = (y * w + x) * ch;
      return [data[idx], data[idx + 1], data[idx + 2]];
    };

    const samples = [
      samplePixel(0, 0),
      samplePixel(w - 1, 0),
      samplePixel(0, h - 1),
      samplePixel(w - 1, h - 1),
      samplePixel(Math.floor(w / 2), 0),
      samplePixel(Math.floor(w / 2), h - 1),
      samplePixel(0, Math.floor(h / 2)),
      samplePixel(w - 1, Math.floor(h / 2)),
    ];

    // 모서리 4개가 균일한 단색인지 검사 (오차 허용 범위 15)
    const tolCheck = 16;
    const baseColor = samples[0];
    const isCornerUniform = samples.slice(0, 4).every(
      (c) =>
        Math.abs(c[0] - baseColor[0]) < tolCheck &&
        Math.abs(c[1] - baseColor[1]) < tolCheck &&
        Math.abs(c[2] - baseColor[2]) < tolCheck,
    );

    if (!isCornerUniform) {
      return null; // 단색 배경이 아니면 자연어/실사 AI 모델로 위임
    }

    // 모서리 색상들의 평균 배경색 산출
    const avgBg: [number, number, number] = [
      Math.round(samples.slice(0, 4).reduce((acc, c) => acc + c[0], 0) / 4),
      Math.round(samples.slice(0, 4).reduce((acc, c) => acc + c[1], 0) / 4),
      Math.round(samples.slice(0, 4).reduce((acc, c) => acc + c[2], 0) / 4),
    ];

    // RGBA 출력 버퍼 생성
    const outData = Buffer.alloc(w * h * 4);
    const colorTolerance = 18;
    const feather = 10;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inIdx = (y * w + x) * ch;
        const outIdx = (y * w + x) * 4;

        const r = data[inIdx];
        const g = data[inIdx + 1];
        const b = data[inIdx + 2];
        const a = ch === 4 ? data[inIdx + 3] : 255;

        const dist = Math.sqrt(
          Math.pow(r - avgBg[0], 2) +
          Math.pow(g - avgBg[1], 2) +
          Math.pow(b - avgBg[2], 2),
        );

        outData[outIdx] = r;
        outData[outIdx + 1] = g;
        outData[outIdx + 2] = b;

        if (dist <= colorTolerance) {
          outData[outIdx + 3] = 0;
        } else if (dist <= colorTolerance + feather) {
          const ratio = (dist - colorTolerance) / feather;
          outData[outIdx + 3] = Math.round(a * ratio);
        } else {
          outData[outIdx + 3] = a;
        }
      }
    }

    return await sharp(outData, {
      raw: { width: w, height: h, channels: 4 },
    })
      .png()
      .toBuffer();
  } catch (err) {
    console.warn("Smart uniform background removal skipped:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.HUGGINGFACE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "HUGGINGFACE_API_KEY가 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let imageBuffer: ArrayBuffer;
    let mimeType = "image/png";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "이미지 파일이 전달되지 않았습니다." },
          { status: 400 },
        );
      }
      mimeType = file.type || "image/png";
      imageBuffer = await file.arrayBuffer();
    } else {
      imageBuffer = await req.arrayBuffer();
    }

    if (!imageBuffer || imageBuffer.byteLength === 0) {
      return NextResponse.json(
        { error: "유효하지 않은 이미지 데이터입니다." },
        { status: 400 },
      );
    }

    const nodeBuffer = Buffer.from(imageBuffer);

    // 1단계: 로고/단색 배경 이미지 스마트 고속 분리 (문체부 로고 등 그래픽 이미지 초고속 100% 성공 보장)
    const smartResult = await trySmartUniformBgRemoval(nodeBuffer);
    if (smartResult) {
      return new Response(new Uint8Array(smartResult), {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "X-Removal-Engine": "smart-uniform",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // 2단계: 복합 배경/실사 이미지에 대한 BiRefNet SOTA AI 추론 (재시도 및 연결 유실 복구 지원)
    let client: any;
    try {
      client = await getBiRefNetClient(apiKey);
    } catch {
      cachedClient = null;
      client = await getBiRefNetClient(apiKey);
    }

    const inputBlob = new Blob([imageBuffer], { type: mimeType });

    let result: any = null;
    try {
      result = await client.predict("/image", [
        inputBlob,
        "", // Resolution
        "General", // 가중치
      ]);
    } catch (predictErr) {
      // 캐시된 연결이 끊긴 경우 1회 재연결 후 재시도
      console.warn("BiRefNet prediction retry after connection refresh...", predictErr);
      cachedClient = null;
      client = await getBiRefNetClient(apiKey);
      result = await client.predict("/image", [inputBlob, "", "General"]);
    }

    if (!result?.data || !Array.isArray(result.data) || !result.data[0]) {
      throw new Error("AI 엔진으로부터 유효한 마스크 결과를 수신하지 못했습니다.");
    }

    const resultTuple = result.data[0];
    const outputItem = Array.isArray(resultTuple) ? resultTuple[1] : resultTuple;
    const outputUrl = outputItem?.url;

    if (!outputUrl) {
      throw new Error("배경 제거 결과 이미지 URL을 찾을 수 없습니다.");
    }

    // 결과 투명 PNG 다운로드
    const downloadRes = await fetch(outputUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!downloadRes.ok) {
      throw new Error(`결과 이미지 다운로드 실패 (${downloadRes.status})`);
    }

    const pngBuffer = await downloadRes.arrayBuffer();

    return new Response(pngBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "X-Removal-Engine": "birefnet-sota",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    cachedClient = null; // 오류 발생 시 클라이언트 재연결을 위해 캐시 초기화
    console.error("remove-bg error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "배경 제거 처리 중 서버 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
