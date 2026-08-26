import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the production Docker image (smaller runtime, clear DATA_DIR mounts).
  output: "standalone",
  // Keep large local/docs artifacts out of the standalone NFT bundle.
  outputFileTracingExcludes: {
    "*": [
      "./Utilization Sheet Final.xlsx",
      "./Week Distribution.docx",
      "./scripts/**/*",
      "./.git/**/*",
    ],
  },
};

export default nextConfig;
