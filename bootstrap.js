'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const root = __dirname;
const parts = fs.readdirSync(root)
  .filter((name) => /^source[.]part[.][0-9]+$/.test(name))
  .sort();

if (parts.length === 0) {
  console.error('The Court source archive parts were not found.');
  process.exit(1);
}

try {
  const compressed = Buffer.concat(parts.map((name) => fs.readFileSync(path.join(root, name))));
  const tar = zlib.brotliDecompressSync(compressed);
  const tempTar = path.join(os.tmpdir(), 'the-court-source.tar');
  fs.writeFileSync(tempTar, tar);
  execFileSync('tar', ['-xf', tempTar, '-C', root], { stdio: 'inherit' });
  fs.unlinkSync(tempTar);

  if (!fs.existsSync(path.join(root, 'server', 'server.js')) ||
      !fs.existsSync(path.join(root, 'public', 'index.html'))) {
    throw new Error('The extracted application files are incomplete.');
  }

  console.log('The Court source archive extracted successfully.');
  require('./server/server.js');
} catch (error) {
  console.error('[The Court bootstrap failed]', error.message);
  process.exit(1);
}
