/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { 
    unoptimized: true,
    domains: ['images.pexels.com'] // Allow external images
  },

  /* --------------------------------------------------------------------------
     The old addresses.

     This site spent its whole build at /v2 behind the previous one, so every
     link that was ever shared of it, and every bookmark, names a path that is
     now the root. Five of those paths were A/B benches that no longer exist as
     routes at all, and they land on the home page rather than a 404.

     LISTED ONE BY ONE RATHER THAN AS /v2/:path*. Redirects are matched before
     the filesystem, so a catch-all would also swallow requests for real files
     that happen to live under that prefix. public/v2/totem_of_undying.png was
     exactly that file, and it has been moved out for the same reason.
     -------------------------------------------------------------------------- */
  async redirects() {
    return [
      { source: '/v2', destination: '/', permanent: true },
      { source: '/v2/projects', destination: '/projects', permanent: true },
      { source: '/v2/projects/:id', destination: '/projects/:id', permanent: true },
      /* The benches. Gone with the move; the record of what each one decided is
         in docs/ab-log.md. */
      { source: '/v2/bench', destination: '/', permanent: true },
      { source: '/v2/awards', destination: '/', permanent: true },
      { source: '/v2/backdrops', destination: '/', permanent: true },
      { source: '/v2/skills', destination: '/', permanent: true },
      { source: '/v2/story', destination: '/', permanent: true },
    ];
  },
};

module.exports = nextConfig;
