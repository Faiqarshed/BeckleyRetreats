/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable eslint checking during builds for production
  eslint: {
    // Warning: This setting will only be used in production!
    ignoreDuringBuilds: true,
  },
  // Disable TypeScript checking during builds for production
  typescript: {
    // Warning: This setting will only be used in production!
    ignoreBuildErrors: true,
  },
  // External packages configuration - updated for Next.js 15.3.0
  serverExternalPackages: ['sharp'],
}

module.exports = nextConfig
