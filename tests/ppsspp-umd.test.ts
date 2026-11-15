import { describe, expect, it } from 'vitest';
import { freeTcpPort } from '../src/main/ppsspp-umd';

describe('psp umd helpers', () => {
  it('reserves a usable free port', async () => {
    const port = await freeTcpPort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });
});
