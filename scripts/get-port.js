#!/usr/bin/env node
const path = require('path');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(str) {
  let crc = -1;
  for (let i = 0; i < str.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ str.charCodeAt(i)) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function getPort(name, base = 20000, range = 10000) {
  const seed = name || path.basename(process.cwd());
  return base + (crc32(seed) % range);
}

if (require.main === module) {
  const arg = process.argv[2];
  console.log(getPort(arg));
}

module.exports = { crc32, getPort };
