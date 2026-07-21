import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx'; // 👈 Importamos MDX

export default defineConfig({
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
    domains: ['villars.pages.dev'],
  },
  integrations: [
    react(),
    sitemap({
      filter: (page) => {
        return !page.includes('/404') &&
               !page.includes('/under-construction') &&
               page !== '/';
      },
    }),
    mdx(), // 👈 Añadimos la integración MDX
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