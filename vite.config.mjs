// `npm run dev` serves the standalone preview; `npm run build:web` builds the same page as a
// static site (relative URLs, so it works under any path, e.g. GitHub Pages).
export default {
  base: './',
  server: {host: '127.0.0.1', port: 5199, strictPort: true},
  build: {outDir: '.preview/site', emptyOutDir: true, target: 'es2022'},
};
