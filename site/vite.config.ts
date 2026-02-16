import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

const fullReloadOnSpecMarkdownChange = {
  name: 'full-reload-on-spec-markdown-change',
  handleHotUpdate(ctx: { file: string; server: { ws: { send: (payload: { type: 'full-reload'; path: string }) => void } } }) {
    if (/[\\/]spec[\\/].+\.md$/i.test(ctx.file)) {
      ctx.server.ws.send({ type: 'full-reload', path: '*' })
      return []
    }
    return undefined
  },
}

export default defineConfig({
  server: {
    port: 3000,
    fs: {
      // allow importing markdown from the repo-level /spec directory
      allow: ['..'],
    },
  },
  plugins: [
    fullReloadOnSpecMarkdownChange,
    tsConfigPaths(),
    tanstackStart(),
    nitro(),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
  ],
})
