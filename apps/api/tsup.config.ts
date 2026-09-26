import { defineConfig } from 'tsup';
import { workspaceExternals } from '../../scripts/tsup-externals.mjs';

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
  external: workspaceExternals(new URL('../..', import.meta.url).pathname),
  banner: {
    js: "import { createRequire as __esCreateRequire } from 'module'; const require = __esCreateRequire(import.meta.url);",
  },
});
