import test from 'node:test';
import assert from 'node:assert/strict';
import { parseListing, reconcile, photoSources, isSold } from '../scripts/inventory.mjs';
import { readPosts, readAll, createGraphClient, downloadPhoto } from '../scripts/facebook.mjs';

const message = `Kragon Auto Sales - 🚗
2018 Hyundai Santa Fe Sport
2.4 L engine
Front wheel drive
79,509 miles
4 new tires
New oil change
Heated seats, backup camera and remote start
New rear brakes and rotors
Super clean inside and out
$11,000
Call Ronnie 606- 568- 5622`;
const config = { markers: ['#KragonInventory', 'Kragon Auto Sales'], missingChecks: 3, missingHours: 24, bindings: {} };
const post = { id: '12_34', message, full_picture: 'https://scontent.fbcdn.net/car.jpg?token=one' };
const inventory = { business: { name: 'Kragon' }, vehicles: [] };
const state = { posts: {} };
const at = hour => new Date(Date.UTC(2026, 10, 13, hour));

test('parses the actual family listing without guessing missing details', () => {
  const car = parseListing(message, config.markers);
  assert.equal(car.year, 2018);
  assert.equal(car.make, 'Hyundai');
  assert.equal(car.model, 'Santa Fe Sport');
  assert.equal(car.price, 11000);
  assert.equal(car.mileage, 79509);
  assert.equal(car.engine, '2.4L');
  assert.equal(car.drivetrain, 'FWD');
  assert.equal(car.transmission, '');
});

test('ignores personal posts and refuses ambiguous prices', () => {
  assert.equal(parseListing(message.replace('Kragon Auto Sales - 🚗\n', ''), config.markers), null);
  assert.equal(parseListing(message + '\n$500 down', config.markers), null);
  assert.equal(parseListing(message.replace('$11,000', 'Call for price'), config.markers), null);
  const chevy = parseListing(message.replace('Kragon Auto Sales - 🚗', '#KragonInventory').replace('Hyundai Santa Fe Sport', 'Chevy Equinox'), config.markers);
  assert.equal(chevy.make, 'Chevrolet');
  assert.equal(isSold('Never sold a better car'), false);
  assert.equal(isSold('SOLD! Thank you'), true);
});

test('adds cars, preserves manual inventory, updates prices, and does not mutate inputs', () => {
  const manual = { id: 'manual', year: 2001, make: 'Ford', model: 'Focus', status: 'available' };
  const original = { ...inventory, vehicles: [manual] };
  const first = reconcile(original, state, [post], config, at(0));
  assert.equal(first.report.added, 1);
  assert.deepEqual(first.inventory.vehicles[0], manual);
  assert.equal(original.vehicles.length, 1);
  assert.deepEqual(state, { posts: {} });
  const second = reconcile(first.inventory, first.state, [{ ...post, message: message.replace('$11,000', '$10,500') }], config, at(1));
  assert.equal(second.report.updated, 1);
  assert.equal(second.inventory.vehicles[1].price, 10500);
});

test('signed photo URL refreshes do not create repeated inventory changes', () => {
  const first = reconcile(inventory, state, [post], config, at(0));
  const second = reconcile(first.inventory, first.state, [{ ...post, full_picture: post.full_picture.replace('one', 'two') }], config, at(1));
  assert.deepEqual(second.inventory, first.inventory);
  assert.equal(second.downloads.length, 0);
});

test('explicit sold edits work without original listing text', () => {
  const first = reconcile(inventory, state, [post], config, at(0));
  const second = reconcile(first.inventory, first.state, [{ id: post.id, message: 'SOLD' }], config, at(1));
  assert.equal(second.inventory.vehicles[0].status, 'sold');
  assert.equal(second.report.sold, 1);
});

test('missing posts need three checks spanning 24 hours; return resets the wait', () => {
  const unrelated = { id: '12_56', message: 'Family picnic' };
  let plan = reconcile(inventory, state, [post], config, at(0));
  plan = reconcile(plan.inventory, plan.state, [unrelated], config, at(1));
  plan = reconcile(plan.inventory, plan.state, [unrelated], config, at(2));
  assert.equal(plan.inventory.vehicles[0].status, 'available');
  const returned = reconcile(plan.inventory, plan.state, [post], config, at(3));
  assert.equal(returned.state.posts[post.id].missingSince, undefined);
  plan = reconcile(plan.inventory, plan.state, [unrelated], config, at(25));
  assert.equal(plan.inventory.vehicles[0].status, 'sold');
});

test('empty feeds and malformed marked edits preserve inventory', () => {
  const first = reconcile(inventory, state, [post], config, at(0));
  assert.throws(() => reconcile(first.inventory, first.state, [], config, at(25)), /empty feed/);
  const edited = reconcile(first.inventory, first.state, [{ ...post, message: 'Kragon Auto Sales - fixing description' }], config, at(25));
  assert.equal(edited.inventory.vehicles[0].status, 'available');
  assert.equal(edited.report.skipped, 1);
});

test('existing cars require explicit binding to prevent duplicates and preserve detail URLs', () => {
  const existing = { ...inventory, vehicles: [{ id: 'santa-fe', year: 2018, make: 'Hyundai', model: 'Santa Fe Sport', status: 'available' }] };
  assert.throws(() => reconcile(existing, state, [post], config), /Bind post/);
  const bound = reconcile(existing, state, [post], { ...config, bindings: { '12_34': 'santa-fe' } });
  assert.equal(bound.inventory.vehicles.length, 1);
  assert.equal(bound.inventory.vehicles[0].id, 'santa-fe');
});

test('extracts full album photos and rejects truncated attachments', () => {
  const album = { attachments: { data: [{ subattachments: { data: [{ type: 'photo', media: { image: { src: post.full_picture } } }] } }] } };
  assert.deepEqual(photoSources(album), [post.full_picture]);
  album.attachments.data[0].subattachments.paging = { next: 'more' };
  assert.throws(() => photoSources(album), /Incomplete/);
});

test('Facebook client authenticates identity and permission and follows all feed pages', async () => {
  const urls = [];
  const fetcher = async (url, options) => {
    urls.push(url.toString());
    assert.equal(options.headers.Authorization, 'Bearer secret');
    let body;
    if (url.pathname.endsWith('/me')) body = { id: '12' };
    else if (url.pathname.endsWith('/permissions')) body = { data: [{ permission: 'user_posts', status: 'granted' }] };
    else if (url.searchParams.has('after')) body = { data: [{ id: '12_56' }] };
    else body = { data: [post], paging: { next: 'https://graph.facebook.com/v27.0/me/posts?after=next&access_token=secret' } };
    return Response.json(body);
  };
  const posts = await readPosts({ token: 'secret', userId: '12', version: 'v27.0', fetcher });
  assert.equal(posts.length, 2);
  assert.equal(urls.some(url => url.includes('access_token')), false);
  await assert.rejects(readPosts({ token: 'secret', userId: '99', version: 'v27.0', fetcher }), /different account/);
  await assert.rejects(readPosts({ token: 'secret', userId: '12', version: 'v27.0', fetcher: async url =>
    Response.json(url.pathname.endsWith('/me') ? { id: '12' } : { data: [] }) }), /must grant/);
});

test('rejects partial feeds, API failures, pagination loops and hostile pagination', async () => {
  await assert.rejects(readAll(async () => ({}), 'posts'), /incomplete/);
  await assert.rejects(readAll(async () => ({ data: [], paging: { next: 'posts' } }), 'posts'), /did not complete/);
  const graph = createGraphClient('secret', 'v27.0', async () => Response.json({ error: { code: 190, message: 'secret' } }));
  await assert.rejects(graph('me'), error => error.message.includes('190') && !error.message.includes('secret'));
  await assert.rejects(graph('https://evil.example/posts'), /Unexpected/);
});

test('tracked posts omitted from the feed are checked directly before counting as missing', async () => {
  const fetcher = async url => {
    if (url.pathname.endsWith('/me')) return Response.json({ id: '12' });
    if (url.pathname.endsWith('/permissions')) return Response.json({ data: [{ permission: 'user_posts', status: 'granted' }] });
    if (url.pathname.endsWith('/posts')) return Response.json({ data: [] });
    return Response.json(post);
  };
  const result = await readPosts({ token: 'secret', userId: '12', version: 'v27.0', trackedIds: [post.id], fetcher });
  assert.equal(result[0].id, post.id);
  const unavailable = (code, subcode) => async url => url.pathname.endsWith('/12_34')
    ? Response.json({ error: { code, error_subcode: subcode } }, { status: 400 }) : fetcher(url);
  assert.deepEqual(await readPosts({ token: 'secret', userId: '12', version: 'v27.0', trackedIds: [post.id], fetcher: unavailable(100, 33) }), []);
  await assert.rejects(readPosts({ token: 'secret', userId: '12', version: 'v27.0', trackedIds: [post.id], fetcher: unavailable(190, 0) }), /190/);
  await assert.rejects(readPosts({ token: 'secret', userId: '12', version: 'v27.0', trackedIds: [post.id], fetcher: unavailable(100, 0) }), /100/);
});

test('photos download as bytes, with no token or untrusted URL requests', async () => {
  let called = false;
  const fetcher = async (url, options) => {
    called = true;
    assert.equal(options.headers, undefined);
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
  };
  await assert.rejects(downloadPhoto('https://evil.example/car.jpg', fetcher), /Facebook image host/);
  assert.equal(called, false);
  const photo = await downloadPhoto(post.full_picture, fetcher);
  assert.equal(photo.ext, 'jpg');
  assert.equal(photo.bytes.length, 3);
  await assert.rejects(downloadPhoto(post.full_picture, async () => new Response('login', { headers: { 'content-type': 'text/html' } })), /invalid/);
});
