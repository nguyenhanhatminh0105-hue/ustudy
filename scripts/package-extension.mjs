/**
 * Packs the built extension (extension/dist) into a zip people can download
 * and load with "Load unpacked". No dependencies: it writes the zip format
 * directly with Node's zlib.
 *
 *   npm run package:extension   ->  ustudy-extension-v<version>.zip
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function listFiles(dir, root = dir) {
  return readdirSync(dir).sort().flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? listFiles(full, root) : [relative(root, full).split('\\').join('/')];
  });
}

// A fixed timestamp (1 January 2026) keeps the zip identical for identical contents.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** Writes every file under `sourceDir` into a zip at `outFile`. Returns the paths inside the zip. */
export function zipDirectory(sourceDir, outFile) {
  const names = listFiles(sourceDir);
  const parts = [];
  const central = [];
  let offset = 0;

  for (const name of names) {
    const data = readFileSync(join(sourceDir, name));
    const packed = deflateRawSync(data, { level: 9 });
    const useDeflate = packed.length < data.length;
    const body = useDeflate ? packed : data;
    const nameBytes = Buffer.from(name, 'utf8');

    const fields = Buffer.alloc(26);
    fields.writeUInt16LE(20, 0); // version needed
    fields.writeUInt16LE(0x0800, 2); // names are UTF-8
    fields.writeUInt16LE(useDeflate ? 8 : 0, 4);
    fields.writeUInt16LE(DOS_TIME, 6);
    fields.writeUInt16LE(DOS_DATE, 8);
    fields.writeUInt32LE(crc32(data), 10);
    fields.writeUInt32LE(body.length, 14);
    fields.writeUInt32LE(data.length, 18);
    fields.writeUInt16LE(nameBytes.length, 22);
    fields.writeUInt16LE(0, 24); // no extra field

    const localHeader = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), fields, nameBytes]);
    parts.push(localHeader, body);

    const tail = Buffer.alloc(14);
    tail.writeUInt32LE(offset, 10); // comment length, disk, attributes stay 0; then the local header's position
    central.push(Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), Buffer.from([20, 0]), fields, tail, nameBytes]));
    offset += localHeader.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(outFile, Buffer.concat([...parts, directory, end]));
  return names;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..');
  const dist = join(root, 'extension', 'dist');
  const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
  const out = join(root, `ustudy-extension-v${version}.zip`);
  const names = zipDirectory(dist, out);
  console.log(`Packed ${names.length} files into ${out}`);
}
