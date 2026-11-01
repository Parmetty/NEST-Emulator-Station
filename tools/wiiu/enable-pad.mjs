import { readFileSync, writeFileSync } from 'node:fs';

const file = 'E:/workstop/nest/resources/engines/cemu/portable/settings.xml';
let t = readFileSync(file, 'utf8');

if (/<open_pad>/.test(t)) {
  t = t.replace(/<open_pad>[^<]*<\/open_pad>/, '<open_pad>true</open_pad>');
} else {
  t = t.replace('</Graphic>', '</Graphic>\n  <open_pad>true</open_pad>');
}
writeFileSync(file, t, 'utf8');
console.log('open_pad set:', /<open_pad>true<\/open_pad>/.test(t));
