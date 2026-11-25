// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Keeps the same URLs as the Ycode export: /esea/ -> /esea/index.html
  build: { format: 'directory' },
  vite: {
    plugins: [tailwindcss()],
  },
});
