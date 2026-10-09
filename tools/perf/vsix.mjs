/* The files of a remote VSIX that a panel needs, and nothing else.

   A VSIX is a zip of 120 MB, and all but ~4 MB of it is the CLI binary no
   panel loads. A zip lists its entries at its end (the central directory),
   each with where its bytes start, so this reads that list with one range
   request and then fetches only the byte ranges of the entries it keeps -
   neighbouring entries in one request. Downloading the whole file from a CI
   runner took 25-70 s; this takes a few.

   Stored and deflated entries only, no zip64 (a VSIX is neither), and every
   entry checked against its size and CRC. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';

async function range(url, from, to) {
  const r = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } });
  if (r.status !== 206) throw new Error(`${url}: ${r.status} for bytes ${from}-${to} (no range support?)`);
  return Buffer.from(await r.arrayBuffer());
}

/* [{ name, method, size, csize, crc, at }] from the central directory. */
async function entries(url) {
  const head = await fetch(url, { method: 'HEAD' });
  const total = Number(head.headers.get('content-length'));
  if (!head.ok || !total) throw new Error(`${url}: ${head.status}, no length`);
  const tailFrom = Math.max(0, total - 65557);
  const tail = await range(url, tailFrom, total - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error(`${url}: not a zip`);
  const count = tail.readUInt16LE(eocd + 10), size = tail.readUInt32LE(eocd + 12), at = tail.readUInt32LE(eocd + 16);
  if (at === 0xffffffff) throw new Error(`${url}: zip64 is not supported`);
  const dir = at >= tailFrom ? tail.subarray(at - tailFrom, at - tailFrom + size) : await range(url, at, at + size - 1);
  const list = [];
  for (let p = 0, i = 0; i < count; i++) {
    const n = dir.readUInt16LE(p + 28), x = dir.readUInt16LE(p + 30), c = dir.readUInt16LE(p + 32);
    list.push({ name: dir.toString('utf8', p + 46, p + 46 + n), method: dir.readUInt16LE(p + 10), crc: dir.readUInt32LE(p + 16),
      csize: dir.readUInt32LE(p + 20), size: dir.readUInt32LE(p + 24), at: dir.readUInt32LE(p + 42) });
    p += 46 + n + x + c;
  }
  /* Each entry runs up to the next one (or the directory): its local header
     can carry an extra field the directory does not show. */
  list.sort((a, b) => a.at - b.at);
  list.forEach((e, i) => { e.end = i + 1 < list.length ? list[i + 1].at : at; });
  return list;
}

function extract(buf, base, e) {
  const p = e.at - base;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error(`${e.name}: no local header`);
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const raw = buf.subarray(start, start + e.csize);
  const data = e.method === 0 ? raw : e.method === 8 ? inflateRawSync(raw) : null;
  if (!data) throw new Error(`${e.name}: compression method ${e.method}`);
  if (data.length !== e.size || crc32(data) !== e.crc) throw new Error(`${e.name}: size or CRC does not match`);
  return data;
}

/* Every file under extension/ except those under `skip` (paths inside
   extension/), written into `into`. Returns the number of bytes fetched. */
export async function fetchExtension(url, into, skip = []) {
  const keep = (await entries(url)).filter((e) => e.name.startsWith('extension/') && !e.name.endsWith('/') &&
    !skip.some((s) => e.name.startsWith(`extension/${s}/`)));
  let fetched = 0;
  for (let i = 0; i < keep.length; ) {
    let j = i;
    while (j + 1 < keep.length && keep[j + 1].at === keep[j].end) j++;
    const buf = await range(url, keep[i].at, keep[j].end - 1);
    fetched += buf.length;
    for (const e of keep.slice(i, j + 1)) {
      const to = join(into, e.name.slice('extension/'.length));
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, extract(buf, keep[i].at, e));
    }
    i = j + 1;
  }
  return fetched;
}
