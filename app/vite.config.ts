import { defineConfig, normalizePath, type Plugin } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '..');
const assetDirs = ['audio', 'data'];

// Git can check out directory symlinks as plain files on Windows. Serve the
// original assets through Vite and copy them into builds without using symlinks.
function repoAssets(): Plugin {
  return {
    name: 'repo-assets',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url;
        if (url && assetDirs.some((dir) => url.startsWith(`/${dir}/`))) {
          // only redirect files that exist in the repo-level dir; anything else (e.g. app/public/data/syl.json,
          // pitch/*.json, conv1_seq.png) falls through to Vite's publicDir, so `/data/<f>` works for both
          let rel = url.split(/[?#]/)[0]!;
          try { rel = decodeURIComponent(rel); } catch { /* keep raw */ }
          if (existsSync(path.join(repoRoot, rel))) req.url = `/@fs/${encodeURI(normalizePath(repoRoot))}${url}`;
        }
        next();
      });
    },
    writeBundle(options) {
      if (!options.dir) return;
      for (const dir of assetDirs) {
        cpSync(path.join(repoRoot, dir), path.join(options.dir, dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [repoAssets()],
  // MV_NO_HMR=1: no live reload (export renders must not reload mid-run when a file changes)
  server: { port: 5173, strictPort: false, hmr: process.env.MV_NO_HMR ? false : undefined, fs: { allow: [repoRoot] } },
  resolve: { alias: { '@root': repoRoot } },
  // pre-bundle the three.js addons the kits import (_svg3d, _gltf): otherwise the first run after a new addon
  // import re-optimizes mid-load and can leave two copies of three on the page
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/loaders/SVGLoader.js',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/math/MeshSurfaceSampler.js',
    ],
  },
  build: { target: 'esnext', assetsInlineLimit: 0 },
});
