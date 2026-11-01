import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const file = 'E:/workstop/nest/resources/engines/cemu/portable/log.txt';
const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });

const counts = new Map();
const re = /(error|failed|unsupported|not implemented|not supported|unimplemented|missing|invalid|denied|assert|panic)/i;
let total = 0;
let hits = 0;

for await (const line of rl) {
  total++;
  if (!re.test(line)) continue;
  hits++;
  // normalize: strip timestamp, hex addresses, numbers
  const key = line
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/0x[0-9a-fA-F]+/g, '0xX')
    .replace(/\b\d{3,}\b/g, 'N')
    .slice(0, 140);
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

console.log(`lines=${total} matching=${hits}\n`);
const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
for (const [msg, n] of top) console.log(`${String(n).padStart(7)}  ${msg}`);
