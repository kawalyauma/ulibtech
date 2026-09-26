// Collects third-party dependencies of all workspace packages so tsup bundles only
// first-party code (@edushare/*) and leaves npm modules (incl. native ones) external.
import fs from 'node:fs';
import path from 'node:path';

export function workspaceExternals(root) {
  const deps = new Set();
  for (const dir of ['packages', 'apps']) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      const file = path.join(root, dir, name, 'package.json');
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const d of Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies })) {
        if (!d.startsWith('@edushare/')) deps.add(d);
      }
    }
  }
  return [...deps].flatMap((d) => [d, new RegExp(`^${d.replace(/[/.]/g, '\\$&')}/`)]);
}
