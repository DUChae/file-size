import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60; // Vercel 함수 최대 실행 시간

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "HUGGINGFACE_API_KEY가 설정되지 않았습니다." },
        { status: 500 },
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let imageBuffer: ArrayBuffer;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "이미지 파일이 전달되지 않았습니다." },
          { status: 400 },
        );
      }
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

    const modelEndpoint =
      "https://router.huggingface.co/hf-inference/models/briaai/RMBG-1.4";

    // 모델 슬립 상태(503) 대응 재시도 루프
    const maxRetries = 3;
    let attempt = 0;
    let lastError = "";

    while (attempt < maxRetries) {
      attempt++;
      const hfResponse = await fetch(modelEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          "Content-Type": "image/png",
        },
        body: imageBuffer,
      });

      if (hfResponse.ok) {
        const resultPng = await hfResponse.arrayBuffer();
        return new Response(resultPng, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }

      if (hfResponse.status === 503) {
        // 모델 가동 중 대기 후 재시도
        const errorJson = await hfResponse.json().catch(() => ({}));
        const waitTime = Math.min(10, Math.max(2, errorJson.estimated_time || 3));
        await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));
        continue;
      }

      const errorText = await hfResponse.text().catch(() => "Unknown error");
      lastError = `HF API 에러 (${hfResponse.status}): ${errorText}`;
      break;
    }

    return NextResponse.json(
      { error: lastError || "배경 제거 처리 실패" },
      { status: 500 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "서버 처리 중 오류가 발생했습니다.",
      },
      { status: 500 },
    );
  }
}
