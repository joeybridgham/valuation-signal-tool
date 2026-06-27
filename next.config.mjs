/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Brief requirement: do NOT use the Next.js <Image> optimizer on remote images
  // (avoids Vercel image-optimization bandwidth charges). We serve plain <img>.
  images: { unoptimized: true },
  // We ship no ESLint config; don't fail production builds on lint. Types still check.
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
