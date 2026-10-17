/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The old Price List and Catalog pages were merged into one Services page.
  // Keep their links (bookmarks, emails) working.
  async redirects() {
    return [
      { source: "/admin/price-list", destination: "/admin/services", permanent: true },
      { source: "/admin/catalog", destination: "/admin/services#catalog", permanent: true },
      { source: "/admin/catalog/:id/edit", destination: "/admin/services/:id/edit", permanent: true },
    ];
  },
};

module.exports = nextConfig;
