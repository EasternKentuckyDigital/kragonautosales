import { mkdir, cp, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(dist);
// Only public site content is packaged. No config, tracking state, or scripts.
for (const name of ['index.html', 'vehicle.html', 'assets', 'data', 'CNAME']) {
  await cp(path.join(root, name), path.join(dist, name), { recursive: true });
}
await writeFile(path.join(dist, '.nojekyll'), '');
console.log('Static site built in dist/.');
