import { readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { digest, parseListing, reconcile } from './inventory.mjs';
import { readPosts, downloadPhoto } from './facebook.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const readJson = async name => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const encode = value => JSON.stringify(value, null, 2) + '\n';
async function atomicJson(name, value) {
  const destination = path.join(root, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination + '.tmp', encode(value));
  await rename(destination + '.tmp', destination);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--apply'].includes(arg))) throw new Error('Usage: node scripts/sync-facebook.mjs [--apply]');
  const apply = args.includes('--apply');
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const userId = process.env.FACEBOOK_USER_ID;
  if (!token || !/^\d+$/.test(userId || '')) throw new Error('Set FACEBOOK_ACCESS_TOKEN and FACEBOOK_USER_ID. Never put tokens in source files.');
  const config = await readJson('config/facebook.json');
  if (!Array.isArray(config.markers) || !config.markers.length || config.markers.some(m => typeof m !== 'string' || !m.trim()) ||
      !Number.isInteger(config.missingChecks) || config.missingChecks < 3 || !Number.isFinite(config.missingHours) || config.missingHours < 24 ||
      !config.bindings || typeof config.bindings !== 'object' || Array.isArray(config.bindings) ||
      new Set(Object.values(config.bindings)).size !== Object.values(config.bindings).length) throw new Error('Invalid Facebook sync configuration.');
  const inventory = await readJson('data/inventory.json');
  if (!Array.isArray(inventory.vehicles) || new Set(inventory.vehicles.map(v => v.id)).size !== inventory.vehicles.length) throw new Error('Invalid inventory.');
  let state;
  try { state = await readJson('.inventory-sync/state.json'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; state = { posts: {} }; }
  const trackedIds = [...new Set([...Object.keys(state.posts || {}), ...Object.keys(config.bindings)])];
  const posts = await readPosts({ token, userId, version: config.graphVersion, trackedIds });
  const plan = reconcile(inventory, state, posts, config);
  // A missing cached image also needs repair even when the post is unchanged.
  for (const [id, entry] of Object.entries(plan.state.posts)) {
    const vehicle = plan.inventory.vehicles.find(v => v.id === entry.vehicleId);
    if (!vehicle || vehicle.status === 'sold' || plan.downloads.some(d => d.vehicleId === vehicle.id)) continue;
    const missing = await Promise.all((vehicle.photos || []).map(photo => access(path.join(root, photo)).then(() => false, () => true)));
    if (missing.some(Boolean)) {
      // Force a fresh plan next time rather than publish with broken pictures.
      throw new Error(`Cached photo is missing for ${id}. Clear its fingerprint in .inventory-sync/state.json and retry.`);
    }
  }
  console.log(`${apply ? 'Apply' : 'Preview'}: ${JSON.stringify(plan.report)}`);
  if (!apply) {
    for (const post of posts) {
      const listing = parseListing(post.message, config.markers);
      if (listing) console.log(`Car post ${post.id}: ${listing.year} ${listing.make} ${listing.model} ($${listing.price})`);
    }
    console.log('Preview only. No files changed. Use --apply after reviewing existing-car bindings.');
    return;
  }
  // Finish all remote reads before writing any inventory/state files.
  const pendingPhotos = [];
  let totalBytes = 0;
  for (const task of plan.downloads) {
    const photos = [];
    for (const src of task.sources) {
      const { bytes, ext } = await downloadPhoto(src);
      totalBytes += bytes.length;
      if (totalBytes > 100 * 1024 * 1024) throw new Error('Photo updates exceed 100 MB. Split the initial import into smaller batches.');
      const name = `assets/cars/facebook/${digest(bytes)}.${ext}`;
      pendingPhotos.push({ name, bytes });
      photos.push(name);
    }
    plan.inventory.vehicles.find(v => v.id === task.vehicleId).photos = photos;
  }
  for (const { name, bytes } of pendingPhotos) {
    await mkdir(path.dirname(path.join(root, name)), { recursive: true });
    await writeFile(path.join(root, name), bytes);
  }
  // In Actions these changes are committed together, then deployed as one artifact.
  await atomicJson('data/inventory.json', plan.inventory);
  await atomicJson('.inventory-sync/state.json', plan.state);
  console.log('Inventory and sync state saved.');
}

main().catch(error => {
  // Do not print remote responses, URLs, stack traces, or access tokens.
  console.error(error instanceof SyntaxError ? 'Invalid local JSON configuration or state.' : error.message);
  process.exitCode = 1;
});
