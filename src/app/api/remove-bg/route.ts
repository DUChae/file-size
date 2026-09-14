import { NextRequest, NextResponse } from "next/server";
import { Client } from "@gradio/client";

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

    const client = await getBiRefNetClient(apiKey);
    const inputBlob = new Blob([imageBuffer], { type: mimeType });

    // BiRefNet SOTA 모델 추론 호출 (/image)
    const result: any = await client.predict("/image", [
      inputBlob,
      "", // Resolution (기본 유지)
      "General", // 최고 품질 범용 가중치
    ]);

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
