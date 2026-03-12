import { defineConfig, defineDocs } from 'fumadocs-mdx/config'

export const docs = defineDocs({
  dir: '../spec',
  docs: {
    files: ['index.md'],
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
})

export default defineConfig()
