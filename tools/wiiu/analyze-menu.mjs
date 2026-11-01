import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const file = 'E:/workstop/nest/resources/engines/cemu/portable/log.txt';
const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });

// Focus on account / Mii / save / failing calls, ignoring the GX2 noise.
const re = /(nn_act|iosu_act|IOSU_ACT|FFL|Mii|SAVE|save|act_|Account|persistent|PersistentId|-6\b|-3\b|Unsupported lib call|error|failed)/i;
const counts = new Map();
const samples = new Map();
let lastLines = [];
let total = 0;

for await (const line of rl) {
  total++;
  lastLines.push(line);
  if (lastLines.length > 400) lastLines.shift();
  if (!re.test(line)) continue;
  const key = line
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/0x[0-9a-fA-F]+/g, '0xX')
    .replace(/\b\d{3,}\b/g, 'N')
    .slice(0, 120);
  counts.set(key, (counts.get(key) ?? 0) + 1);
  if (!samples.has(key)) samples.set(key, line.trim().slice(0, 200));
}

console.log(`lines=${total}\n`);
for (const [msg, n] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`${String(n).padStart(6)}  ${msg}`);
}
console.log('\n--- last 40 lines ---');
for (const l of lastLines.slice(-40)) console.log(l);
