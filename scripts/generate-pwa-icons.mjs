import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.resolve(process.cwd(), 'public');
const sizes = [180, 192, 512];

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function makePng(size) {
  const background = { r: 16, g: 20, b: 18, a: 255 };
  const gold = { r: 244, g: 207, b: 107, a: 255 };
  const goldLight = { r: 249, g: 232, b: 160, a: 255 };
  const green = { r: 185, g: 213, b: 139, a: 255 };
  const shadow = { r: 0, g: 0, b: 0, a: 80 };

  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      px[i] = background.r;
      px[i + 1] = background.g;
      px[i + 2] = background.b;
      px[i + 3] = background.a;
    }
  }

  const cell = size / 16;
  const rect = (x0, y0, x1, y1, color) => {
    const sx = Math.max(0, Math.floor(x0 * cell));
    const sy = Math.max(0, Math.floor(y0 * cell));
    const ex = Math.min(size, Math.ceil(x1 * cell));
    const ey = Math.min(size, Math.ceil(y1 * cell));

    for (let y = sy; y < ey; y += 1) {
      for (let x = sx; x < ex; x += 1) {
        const i = (y * size + x) * 4;
        px[i] = color.r;
        px[i + 1] = color.g;
        px[i + 2] = color.b;
        px[i + 3] = color.a;
      }
    }
  };

  const drawBlock = (x, y, w, h, color) => {
    rect(x + 0.25, y + 0.25, x + w - 0.25, y + h - 0.25, color);
  };

  // Shadow under the motif.
  drawBlock(4.4, 5, 7.2, 7.2, shadow);
  drawBlock(5, 4.4, 7.2, 7.2, shadow);

  // Main tetromino-inspired mark.
  drawBlock(4, 4, 8, 2.2, gold);
  drawBlock(6, 5.6, 4, 2.2, gold);
  drawBlock(6, 7.8, 4, 2.2, goldLight);
  drawBlock(6, 10, 4, 2.2, green);

  // A tiny accent block to suggest the game grid.
  drawBlock(10.2, 10.2, 1.5, 1.5, goldLight);

  const rows = [];
  for (let y = 0; y < size; y += 1) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0;
    for (let x = 0; x < size; x += 1) {
      const src = (y * size + x) * 4;
      const dst = 1 + x * 4;
      row[dst] = px[src];
      row[dst + 1] = px[src + 1];
      row[dst + 2] = px[src + 2];
      row[dst + 3] = px[src + 3];
    }
    rows.push(row);
  }

  const raw = Buffer.concat(rows);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  return png;
}

fs.mkdirSync(outDir, { recursive: true });
for (const size of sizes) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), makePng(size));
}
fs.copyFileSync(path.join(outDir, 'icon-192.png'), path.join(outDir, 'apple-touch-icon.png'));
