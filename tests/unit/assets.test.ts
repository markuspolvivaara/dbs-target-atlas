import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ASSET_VERSIONS, assetUrl } from '../../src/brand';

describe('asset addresses', () => {
  it('every folder of public/assets has a version, and an asset’s address carries its folder’s', () => {
    const folders = readdirSync(new URL('../../public/assets', import.meta.url), { withFileTypes: true }).filter((e) => !e.name.startsWith('.') && !/ \d+\./.test(e.name));
    expect(folders.length).toBeGreaterThan(10);
    for (const e of folders) expect(ASSET_VERSIONS[e.name], e.name).toMatch(/^[0-9a-f]{10}$/);
    expect(assetUrl('assets/spine/sp_l3.glb')).toBe(`./assets/spine/sp_l3.glb?v=${ASSET_VERSIONS.spine}`);
    expect(assetUrl('assets/spine/drill/sacrum_rest.glb')).toBe(`./assets/spine/drill/sacrum_rest.glb?v=${ASSET_VERSIONS.spine}`);
    expect(assetUrl('assets/home/spine.webp')).toMatch(/\.webp\?v=[0-9a-f]{10}$/);
    // two folders with different contents have different versions; an address outside assets has none
    expect(ASSET_VERSIONS.spine).not.toBe(ASSET_VERSIONS.cortex);
    expect(assetUrl('THIRD_PARTY_LICENSES.txt')).toBe('./THIRD_PARTY_LICENSES.txt');
  });
});
