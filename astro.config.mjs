import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

export default defineConfig({
  // Keep Astro 4's HTML-aware whitespace behavior during the migration.
  compressHTML: true,
  site: 'https://villars.solarispkn.com.ar',
  base: '/',
  output: 'static',
  build: {
    assets: 'assets',
  },
  image: {
    service: {
      entrypoint: 'astro/assets/services/sharp',
    },
    domains: ['villars.solarispkn.com.ar'],
  },
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/404') &&
        !page.includes('/under-construction'),
    }),
    mdx(),
  ],
  vite: {
    resolve: {
      alias: {
        '@': '/src',
        '@assets': '/src/assets',
        '@scripts': '/src/scripts',
        '@styles': '/src/styles',
        '@components': '/src/components',
        '@layouts': '/src/layouts',
        '@locales': '/src/locales',
      },
    },
  },
});
