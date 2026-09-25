/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: {
    unoptimized: true,
  },
  reactStrictMode: false,
  basePath: '',
  assetPrefix: '',
};

module.exports = nextConfig;
