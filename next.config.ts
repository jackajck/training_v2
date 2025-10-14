import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable webpack cache to prevent file permission issues in Replit
  webpack: (config) => {
    config.cache = false;
    return config;
  },

  // Add output configuration for better compatibility
  output: 'standalone',

  // Disable static optimization for problematic pages
  reactStrictMode: true,
};

export default nextConfig;
