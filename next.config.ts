import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // No other site can show the app inside a frame (clickjacking). 'self' keeps the PDF ticket viewer working.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
        ],
      },
    ];
  },
  experimental: {
    // The tab pages are thin shells around client-side data (sheet + Supabase), so a loaded tab
    // can be reused for an hour; switching tabs then never waits on the server.
    staleTimes: { static: 3600 },
  },
};

export default nextConfig;
