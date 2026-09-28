import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes com binários/sockets nativos ficam fora do bundle do servidor.
  serverExternalPackages: ["ioredis", "ws", "@prisma/client", "prisma"],
  // Saída autocontida para a imagem Docker (ver Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // SSE atrás de proxies reversos (nginx) não pode ser bufferizado.
        source: "/api/stream/:path*",
        headers: [
          { key: "X-Accel-Buffering", value: "no" },
          { key: "Cache-Control", value: "no-cache, no-transform" },
        ],
      },
    ];
  },
};

export default nextConfig;
