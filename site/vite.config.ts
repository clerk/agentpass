import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'

const SPEC_MARKDOWN_RE = /[\\/]spec[\\/].+\.md$/i
const SPEC_CATALOG_FILE = fileURLToPath(new URL('./src/lib/spec.ts', import.meta.url))

const fullReloadOnSpecMarkdownChange = {
  name: 'full-reload-on-spec-markdown-change',
  handleHotUpdate(ctx: { file: string; server: { moduleGraph: { onFileChange: (file: string) => void }; ws: { send: (payload: { type: 'full-reload'; path: string }) => void } } }) {
    if (SPEC_MARKDOWN_RE.test(ctx.file)) {
      // `spec.ts` builds an in-memory catalog at module eval time.
      // Invalidate it so full reload reflects markdown edits immediately.
      ctx.server.moduleGraph.onFileChange(SPEC_CATALOG_FILE)
      ctx.server.ws.send({ type: 'full-reload', path: '*' })
    }
    return undefined
  },
}

export default defineConfig({
  server: {
    port: 3000,
    watch: {
      // Codex edits can be applied in ways that miss fs events on some setups.
      // Polling keeps HMR consistent for both local and agent-made changes.
      usePolling: true,
      interval: 100,
    },
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
