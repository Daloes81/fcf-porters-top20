/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'files.fcf.cat' },
      { protocol: 'https', hostname: 'www.fcf.cat' }
    ]
  }
};

module.exports = nextConfig;
