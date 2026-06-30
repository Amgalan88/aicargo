import { deflateSync } from 'zlib'
import { writeFileSync } from 'fs'

function u32be(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }

function crc32(buf) {
  let c = 0xFFFFFFFF
  for (const byte of buf) { c ^= byte; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0) }
  return (c ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  return Buffer.concat([u32be(data.length), t, data, u32be(crc32(Buffer.concat([t, data])))])
}

function makePNG(size, [r, g, b]) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.from([
    ...u32be(size), ...u32be(size),
    8, 2, 0, 0, 0  // 8-bit RGB
  ])
  // Build raw pixels: filter_byte(0) + RGB per row
  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const p = row + 1 + x * 3
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b
    }
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

writeFileSync('public/icon-192.png', makePNG(192, [192, 90, 42]))
writeFileSync('public/icon-512.png', makePNG(512, [192, 90, 42]))
console.log('✓ icon-192.png, icon-512.png үүслээ')
