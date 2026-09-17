import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // react-pdf нь ESM + native font parser — bundle хийхгүй, node_modules-оос шууд ачаална
  serverExternalPackages: ["@react-pdf/renderer"],
  // PDF үүсгэх функцэд фонтын файлууд Vercel дээр хамт очих ёстой
  outputFileTracingIncludes: {
    "/api/admin/warehouse-contracts/[id]/pdf": ["./assets/fonts/**/*"],
    "/api/super/warehouse-contracts/[id]/pdf": ["./assets/fonts/**/*"],
    "/api/public/contracts/[token]/pdf": ["./assets/fonts/**/*"],
  },
};

export default nextConfig;
