import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';

const publicUrl = new URL('../public/', import.meta.url);
const readPublic = (path) => readFile(new URL(path, publicUrl));
const manifest = JSON.parse(await readPublic('manifest.webmanifest'));

test('manifest icons have their declared PNG dimensions and support both purposes', async () => {
  assert.deepEqual(manifest.icons.map((icon) => icon.sizes), ['192x192', '512x512']);
  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
    assert.equal(icon.purpose, 'any maskable');
    const url = new URL(icon.src, 'https://fiona.example');
    assert.ok(url.pathname.startsWith(manifest.scope));
    const png = await readPublic(url.pathname.slice(manifest.scope.length));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test('service worker precaches all icons and the independent full loading logo', async () => {
  const listeners = new Map();
  const worker = {
    addEventListener: (event, handler) => listeners.set(event, handler),
    skipWaiting() {},
  };
  let precached;
  const caches = { open: async () => ({ addAll: async (urls) => { precached = [...urls]; } }) };
  vm.runInNewContext(await readPublic('sw.js'), { self: worker, caches });
  let installed;
  listeners.get('install')({ waitUntil: (promise) => { installed = promise; } });
  await installed;
  for (const icon of manifest.icons) assert.ok(precached.includes(icon.src));
  assert.ok(precached.includes('/app/alpha-logo.webp'));
  for (const path of precached) {
    const { pathname } = new URL(path, 'https://fiona.example');
    if (pathname === manifest.scope) continue;
    if (pathname.endsWith('/index.html')) continue;
    await readPublic(pathname.slice(manifest.scope.length));
  }
});

test('only the two required app icon images remain', async () => {
  assert.deepEqual((await readdir(new URL('icons/', publicUrl))).sort(), [
    'fiona-192.png',
    'fiona-512.png',
  ]);
});
