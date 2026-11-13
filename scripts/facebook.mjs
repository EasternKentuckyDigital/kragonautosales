const graphOrigin = 'https://graph.facebook.com';

export function createGraphClient(token, version, fetcher = fetch) {
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('Invalid Graph API version.');
  return async function graph(path) {
    const url = new URL(path, `${graphOrigin}/${version}/`);
    if (url.origin !== graphOrigin || !url.pathname.startsWith(`/${version}/`)) throw new Error('Unexpected Graph pagination URL.');
    // Facebook may include the token in pagination URLs. Never log those URLs.
    url.searchParams.delete('access_token');
    let response;
    try {
      response = await fetcher(url, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: 'error', signal: AbortSignal.timeout(30000)
      });
    } catch { throw new Error('Facebook network request failed; inventory was preserved.'); }
    let body;
    try { body = await response.json(); } catch { throw new Error('Facebook returned invalid JSON.'); }
    if (!response.ok || body.error) {
      const code = Number(body.error?.code) || response.status;
      const error = new Error(`Facebook request failed (code ${code}). Check token expiry and user_posts access. Inventory was preserved.`);
      error.graphCode = code;
      error.graphSubcode = Number(body.error?.error_subcode);
      throw error;
    }
    return body;
  };
}

export async function readAll(graph, path) {
  const results = [];
  const visited = new Set();
  let next = path;
  while (next) {
    if (visited.has(next) || visited.size >= 1000) throw new Error('Facebook pagination did not complete.');
    visited.add(next);
    const body = await graph(next);
    if (!Array.isArray(body.data)) throw new Error('Facebook returned an incomplete feed.');
    results.push(...body.data);
    next = body.paging?.next;
  }
  return results;
}

export async function readPosts({ token, userId, version, trackedIds = [], fetcher = fetch }) {
  const graph = createGraphClient(token, version, fetcher);
  const identity = await graph('me?fields=id');
  if (identity.id !== userId) throw new Error('Facebook token belongs to a different account. Check FACEBOOK_USER_ID.');
  const permissions = await readAll(graph, 'me/permissions');
  if (!permissions.some(p => p.permission === 'user_posts' && p.status === 'granted')) {
    throw new Error('Mom must grant user_posts to this Meta app before syncing.');
  }
  const fields = 'id,message,full_picture,attachments.limit(100){type,media,subattachments.limit(100){type,media}}';
  const posts = await readAll(graph, `me/posts?limit=100&fields=${encodeURIComponent(fields)}`);
  if (new Set(posts.map(post => post.id)).size !== posts.length) throw new Error('Facebook returned duplicate posts; try again.');
  // A post falling out of feed results is not evidence of deletion. Check it directly.
  const seen = new Set(posts.map(post => post.id));
  for (const id of trackedIds) {
    if (!/^\d+(?:_\d+)?$/.test(id)) throw new Error('Invalid tracked Facebook ID.');
    if (seen.has(id)) continue;
    try {
      const post = await graph(`${id}?fields=${encodeURIComponent(fields)}`);
      if (post.id !== id) throw new Error('Facebook returned an unexpected tracked post.');
      posts.push(post);
    } catch (error) {
      // Object-unavailable may mean deleted OR hidden. Only this precise response
      // starts the grace period. Token/permission/rate-limit errors abort the sync.
      if (error.graphCode !== 100 || error.graphSubcode !== 33) throw error;
    }
  }
  return posts;
}

export async function downloadPhoto(src, fetcher = fetch) {
  const url = new URL(src);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !['fbcdn.net', 'fbsbx.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error('Photo URL is not a Facebook image host.');
  }
  let response;
  try { response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('Photo download failed; inventory was preserved.'); }
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[
    response.headers.get('content-type')?.split(';')[0].trim()];
  if (!response.ok || !ext || !response.body) throw new Error('Facebook photo response was invalid.');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw new Error('Facebook photo exceeds 20 MB.');
    chunks.push(chunk);
  }
  if (!size) throw new Error('Facebook returned an empty photo.');
  return { bytes: Buffer.concat(chunks), ext };
}
