import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // proxy.ts가 있으면 Next가 요청 본문을 복사해 두는데, 기본 10MB를 넘으면 조용히 잘라
  // /api/compress가 깨진 파일을 받는다. 업로드 상한을 여기서 정한다.
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  images: { unoptimized: true },
  serverExternalPackages: ["@gradio/client", "sharp"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
