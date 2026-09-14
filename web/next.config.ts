import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF.js resolves its Node fake-worker module relative to the installed
  // package. Keep it external so Vercel does not split the worker into a
  // missing server chunk.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
