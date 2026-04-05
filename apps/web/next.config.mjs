/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  async redirects() {
    return [
      // Redirect old maintenance vendor routes to new vendor routes
      {
        source: '/maintenance',
        destination: '/vendors',
        permanent: true,
      },
      {
        source: '/maintenance/vendors/:path*',
        destination: '/vendors/:path*',
        permanent: true,
      },
    ]
  },
};

export default nextConfig;
