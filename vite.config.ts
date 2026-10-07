import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { cpSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Source assets that live in /public for reference but are never requested by
 * the site: the original vehicle files (the browser loads optimised copies from
 * /public/models/web) and the retired stand-ins. Keeping them out of the build
 * saves ~600 MB of deploy weight. The files themselves are left untouched.
 */
const NOT_SHIPPED = [
  /^2023_porsche_911_gt3_rs\.glb$/,
  /^2024_aston_martin_db12_volante\.glb$/,
  /^free_lamborghini_revuelto\.glb$/,
  /^mc_laren_750s\.glb$/,
  /^mercedes_amg_gt_63_rigged_model__free\.glb$/,
  /^法拉利SF90 Stradale\.glb$/,
  /^standin-.*\.glb$/,
]

function copyPublicSelectively(): Plugin {
  let outDir = 'dist'
  return {
    name: 'veloce:copy-public',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir)
    },
    closeBundle() {
      cpSync(resolve(__dirname, 'public'), outDir, {
        recursive: true,
        filter: (src) => !NOT_SHIPPED.some((re) => re.test(basename(src))),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyPublicSelectively()],
  build: { copyPublicDir: false },
  // The backend (server/index.js) runs on :3001. Forwarding /api through Vite keeps
  // the browser on one origin, so the frontend can call fetch('/api/...') as-is.
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
