import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist',
    clean: true,
    external: ['react', 'cloudflare:workers'],
  },
  {
    entry: ['src/react/index.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist/react',
    external: ['react', 'cloudflare:workers'],
  },
  {
    entry: ['src/durable-objects.ts'],
    format: ['esm'],
    dts: true,
    outDir: 'dist/durable-objects',
    external: ['react', 'cloudflare:workers'],
  },
]);
