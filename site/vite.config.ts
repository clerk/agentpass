import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'
import mdx from 'fumadocs-mdx/vite'

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
    mdx(await import('./source.config')),
    tailwindcss(),
    tsConfigPaths(),
    tanstackStart(),
    nitro(),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
  ],
})
