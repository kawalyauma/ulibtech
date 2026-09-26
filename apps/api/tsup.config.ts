import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scripts/create-admin.ts', 'src/scripts/migrate.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  // Bundle workspace packages; keep third-party (incl. native) modules external.
  noExternal: [/^@edushare\//],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
