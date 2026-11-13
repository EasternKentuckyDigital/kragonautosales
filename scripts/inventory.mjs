import { createHash } from 'node:crypto';

const makes = ['Buick', 'Cadillac', 'Chevrolet', 'Chevy', 'Chrysler', 'Dodge', 'Ford',
  'GMC', 'Jeep', 'Lincoln', 'Mercury', 'Oldsmobile', 'Plymouth', 'Pontiac', 'Ram',
  'Saturn', 'Honda', 'Hyundai', 'Kia', 'Mazda', 'Mitsubishi', 'Nissan', 'Subaru',
  'Suzuki', 'Toyota', 'Volkswagen'];
const titlePattern = new RegExp(`^\\s*((?:19|20)\\d{2})\\s+(${makes.join('|')})\\s+([^\\n]+)`, 'im');
export const digest = value => createHash('sha256').update(value).digest('hex');
export const isSold = text => /^\s*(?:[🚗✅❌🔴\s]*)(?:sold|#sold)\b/im.test(text);

export function parseListing(message, markers) {
  if (typeof message !== 'string') return null;
  const lines = message.replaceAll('\r', '').split('\n');
  // Match a label at the start of a line, or an explicit hashtag anywhere.
  const marked = markers.some(marker => marker.startsWith('#')
    ? new RegExp(`${marker}\\b`, 'i').test(message)
    : lines.some(line => line.trim().toLowerCase().startsWith(marker.toLowerCase())));
  if (!marked) return null;
  const title = message.match(titlePattern);
  const prices = [...message.matchAll(/\$\s*(\d[\d,]*(?:\.\d{2})?)\b/g)];
  // Ambiguous prices (for example down payment + asking price) require a manual edit.
  if (!title || prices.length !== 1) return null;
  const price = Number(prices[0][1].replaceAll(',', ''));
  if (!Number.isFinite(price) || price <= 0) return null;
  const mileage = message.match(/\b(\d[\d,]*)\s*(?:miles|mi)\b/i);
  const engine = message.match(/\b(\d(?:\.\d)?)\s*[lL]\b(?:\s*(V\d))?/);
  const drivetrain = /\b(?:AWD|all[ -]wheel drive)\b/i.test(message) ? 'AWD'
    : /\b(?:FWD|front[ -]wheel drive)\b/i.test(message) ? 'FWD'
    : /\b(?:RWD|rear[ -]wheel drive)\b/i.test(message) ? 'RWD'
    : /\b(?:4WD|4x4|four[ -]wheel drive)\b/i.test(message) ? '4WD' : '';
  const description = lines.filter(line => !markers.some(marker =>
    line.trim().toLowerCase().startsWith(marker.toLowerCase())))
    .join('\n').replace(/#KragonInventory\b/gi, '').trim();
  return {
    year: Number(title[1]),
    make: /^chevy$/i.test(title[2]) ? 'Chevrolet' : makes.find(make => make.toLowerCase() === title[2].toLowerCase()),
    model: title[3].replace(/\s*#KragonInventory\b/gi, '').trim(),
    price, mileage: mileage ? Number(mileage[1].replaceAll(',', '')) : null,
    engine: engine ? `${engine[1]}L${engine[2] ? ` ${engine[2].toUpperCase()}` : ''}` : '',
    drivetrain,
    transmission: /\bautomatic\b/i.test(message) ? 'Automatic' : /\bmanual\b/i.test(message) ? 'Manual' : '',
    description, highlights: [], status: isSold(message) ? 'sold' : 'available'
  };
}

export function photoSources(post) {
  const photos = [];
  const visit = edge => {
    if (!edge) return;
    if (!Array.isArray(edge.data) || edge.paging?.next) throw new Error('Incomplete photo attachments; inventory was preserved.');
    for (const item of edge.data) {
      if (item.subattachments) visit(item.subattachments);
      else if (item.media?.image?.src && (!item.type || /photo/i.test(item.type))) photos.push(item.media.image.src);
    }
  };
  visit(post.attachments);
  if (!photos.length && post.full_picture) photos.push(post.full_picture);
  return [...new Set(photos)];
}

export function fingerprint(post, sources) {
  return digest(JSON.stringify([post.message, sources.map(src => {
    const url = new URL(src);
    return url.origin + url.pathname;
  })]));
}

// Only a complete, authenticated snapshot may reach this function.
export function reconcile(inventory, state, posts, config, now = new Date()) {
  const next = structuredClone(inventory);
  const tracking = structuredClone(state);
  tracking.posts ??= {};
  const seen = new Set();
  const downloads = [];
  const report = { added: 0, updated: 0, sold: 0, missing: 0, skipped: 0 };
  for (const post of posts) {
    if (!/^\d+(?:_\d+)?$/.test(post.id)) throw new Error('Unexpected Facebook post ID.');
    seen.add(post.id);
    const bound = config.bindings[post.id];
    let entry = tracking.posts[post.id];
    let vehicle = next.vehicles.find(v => v.id === (entry?.vehicleId || bound));
    if (bound && !vehicle) throw new Error(`Binding for ${post.id} points to an unknown vehicle.`);
    if (entry) {
      delete entry.missingSince;
      delete entry.missingCount;
    }
    // Sold edits still work if mom removes the original price or label.
    if (vehicle && isSold(post.message || '')) {
      if (vehicle.status !== 'sold') { vehicle.status = 'sold'; vehicle.updatedAt = now.toISOString(); report.sold++; }
      tracking.posts[post.id] = { vehicleId: vehicle.id, fingerprint: null };
      continue;
    }
    const listing = parseListing(post.message, config.markers);
    if (!listing) {
      if (vehicle || config.markers.some(m => (post.message || '').toLowerCase().includes(m.toLowerCase()))) report.skipped++;
      continue;
    }
    if (listing.status === 'sold' && !vehicle) continue;
    const sources = photoSources(post);
    if (!sources.length && !vehicle?.photos?.length) { report.skipped++; continue; }
    const hash = fingerprint(post, sources);
    if (entry?.fingerprint === hash && vehicle) continue;
    const id = vehicle?.id || `facebook-${post.id}`;
    if (!vehicle) {
      const manualMatch = next.vehicles.find(v => v.status !== 'sold' && v.year === listing.year &&
        v.make.toLowerCase() === listing.make.toLowerCase() &&
        listing.model.toLowerCase().startsWith(v.model.toLowerCase()) &&
        !Object.values(tracking.posts).some(e => e.vehicleId === v.id));
      if (manualMatch) throw new Error(`Bind post ${post.id} to existing vehicle ${manualMatch.id} in config/facebook.json before applying.`);
      vehicle = { id, trim: '', vin: '', stockNumber: '', exterior: '', interior: '', featured: true, photos: [] };
      next.vehicles.push(vehicle);
      report.added++;
    } else report.updated++;
    Object.assign(vehicle, listing, { updatedAt: now.toISOString() });
    tracking.posts[post.id] = { vehicleId: id, fingerprint: hash };
    if (sources.length) downloads.push({ vehicleId: id, sources });
  }
  const trackedActive = Object.entries(tracking.posts).filter(([, e]) =>
    next.vehicles.some(v => v.id === e.vehicleId && v.status !== 'sold'));
  // An entirely empty feed is often a visibility problem. Never mass-remove inventory from it.
  if (!posts.length && trackedActive.length) throw new Error('Facebook returned an empty feed; inventory was preserved.');
  for (const [id, entry] of Object.entries(tracking.posts)) {
    if (seen.has(id)) continue;
    const vehicle = next.vehicles.find(v => v.id === entry.vehicleId);
    if (!vehicle || vehicle.status === 'sold') continue;
    entry.missingSince ??= now.toISOString();
    entry.missingCount = (entry.missingCount || 0) + 1;
    report.missing++;
    if (entry.missingCount >= config.missingChecks && now - new Date(entry.missingSince) >= config.missingHours * 3600000) {
      vehicle.status = 'sold';
      vehicle.updatedAt = now.toISOString();
      report.sold++;
    }
  }
  return { inventory: next, state: tracking, downloads, report };
}
