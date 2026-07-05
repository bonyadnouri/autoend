/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/__testbed/contract.json",
        destination: "/api/testbed/contract",
      },
    ];
  },
};

export default nextConfig;
