import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Expose API routes with longer timeout for NSE fetching
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
