import { describe, expect, it } from 'vitest';
import { MANIFEST } from '../../src/data';
import { ACPC, MCP, acpcToMni, mniToAcpc } from '../../src/data/acpc';
import { decode, defaultState, encode } from '../../src/state';
import * as THREE from 'three';
import { anchorOffset, contactCentres, LEAD } from '../../src/viewer/lead';
import { nodeMeans } from './glb';

describe('shipped GLBs', () => {
  it.each(MANIFEST.structures.filter((s) => s.surfaceCentroid).map((s) => [s.id, s]))('%s: decoded mesh matches the uncompressed pipeline mesh, on the right side', async (_id, s) => {
    const means = await nodeMeans(s.file);
    for (const side of ['L', 'R'] as const) {
      const c = s.surfaceCentroid![side];
      const d = Math.hypot(...means[side].map((v, i) => v - c[i]));
      expect(d, `${s.id}/${side}`).toBeLessThan(0.1); // quantization error only
      expect(Math.sign(means[side][0])).toBe(side === 'L' ? -1 : 1);
    }
  });
  it.each(MANIFEST.structures.filter((s) => s.type === 'tract').map((s) => [s.id, s]))('%s: decoded streamline centroid matches the pipeline report', async (_id, s) => {
    const means = await nodeMeans(s.file);
    for (const side of ['L', 'R'] as const) {
      const d = Math.hypot(...means[side].map((v, i) => v - s.centroid![side][i]));
      expect(d, `${s.id}/${side}`).toBeLessThan(0.1);
    }
  });
});

describe('AC-PC conversion (Lead-DBS ea_mni2acpc frame, template space)', () => {
  it('MCP maps to the origin; AC and PC lie on the y axis', () => {
    expect(mniToAcpc(MCP).map((v) => Math.abs(v))).toEqual([0, 0, 0].map(() => expect.any(Number)));
    for (const v of mniToAcpc(MCP)) expect(Math.abs(v)).toBeLessThan(1e-9);
    const ac = mniToAcpc(ACPC.AC as [number, number, number]);
    const pc = mniToAcpc(ACPC.PC as [number, number, number]);
    expect(Math.abs(ac[0]) + Math.abs(ac[2])).toBeLessThan(1e-9);
    expect(ac[1]).toBeGreaterThan(0); // AC anterior
    expect(pc[1]).toBeLessThan(0);
    expect(ac[1] - pc[1]).toBeCloseTo(Math.hypot(...(ACPC.AC as number[]).map((v, i) => v - (ACPC.PC as number[])[i])), 9);
  });
  it('round-trips and keeps right positive', () => {
    const p: [number, number, number] = [12.3, -14.1, -6.8];
    const back = acpcToMni(mniToAcpc(p));
    back.forEach((v, i) => expect(v).toBeCloseTo(p[i], 9));
    expect(mniToAcpc([20, MCP[1], MCP[2]])[0]).toBeGreaterThan(0);
  });
});

describe('URL state', () => {
  it('maps camera preset names from links shared before the rename', () => {
    expect(decode('#/atlas?i=pd&c=anterior').cam.preset).toBe('coronal');
    expect(decode('#/atlas?i=pd&c=lateral').cam.preset).toBe('sagittal');
    expect(decode('#/atlas?i=pd&c=superior').cam.preset).toBe('axial');
    expect(decode('#/atlas?i=pd&c=axial').cam.preset).toBe('axial');
  });
  it('round-trips a teaching link', () => {
    const s = defaultState();
    s.ind = 'et'; s.sym = 'et-head'; s.hemi = 'L';
    s.cam = { preset: null, pos: [10, 120, 30], tgt: [0, -12, -2] };
    s.layers.cortex = { on: false, opacity: 1 };
    s.layers.tracts.opacity = 0.5;
    s.clip.axial = { on: true, mm: -4.5 };
    s.cutSide = 'L';
    s.layers.electrode.on = true; s.lead = { ...s.lead, spacing: 1.5, depth: 2, stim: true, contact: 2, radius: 2.5 };
    s.sel = 'drtt';
    s.labels = 'all';
    s.sliceSeq = 't2';
    s.hidden = ['cst', 't-ss-tremor', 'ss_tremor'];
    const back = decode(encode(s));
    expect(back.ind).toBe('et'); expect(back.sym).toBe('et-head'); expect(back.hemi).toBe('L');
    expect(back.cam.pos).toEqual([10, 120, 30]);
    expect(back.layers.cortex.on).toBe(false); expect(back.layers.tracts.opacity).toBe(0.5);
    expect(back.clip.axial).toEqual({ on: true, mm: -4.5 });
    expect(back.cutSide).toBe('L');
    // links from the earlier per-plane cut option still open their slice (the old cut flags are ignored)
    expect(decode('#/atlas?i=pd&co=-13cf').clip.coronal).toEqual({ on: true, mm: -13 });
    expect(decode('#/atlas?i=pd&co=-13cf').cutSide).toBe('none');
    expect(back.lead).toMatchObject({ spacing: 1.5, depth: 2, stim: true, contact: 2, radius: 2.5 });
    expect(back.sel).toBe('drtt');
    expect(back.labels).toBe('all');
    expect(back.sliceSeq).toBe('t2');
    expect(decode('#/atlas?i=pd').sliceSeq).toBe('t1');
    expect(decode('#/atlas?i=pd&lb=0').labels).toBe('off'); // older links with labels switched off
    expect(decode('#/atlas?i=pd').labels).toBe('hover');
    expect(back.hidden).toEqual(['cst', 't-ss-tremor', 'ss_tremor']);
  });
});

describe('lead anchor', () => {
  const target = new THREE.Vector3(-12, -14, -7);
  const base = { spacing: 0.5, depth: 0, ring: 60, tilt: 15, stim: false, contact: 0, radius: 2 };
  it.each([['c0', 0], ['c1', 1], ['c2', 2], ['c3', 3]] as const)('%s: that contact centre sits on the target', (anchor, k) => {
    for (const spacing of [0.5, 1.5]) {
      const g = contactCentres(target, { ...base, spacing, anchor }, 'L');
      expect(g.centres[k].distanceTo(target)).toBeLessThan(1e-9);
    }
  });
  it('tip and array centre anchors, and depth moves the lead deeper along its axis', () => {
    expect(contactCentres(target, { ...base, anchor: 'tip' }, 'L').tip.distanceTo(target)).toBeLessThan(1e-9);
    const c = contactCentres(target, { ...base, anchor: 'centre' }, 'L');
    expect(c.centres[1].clone().add(c.centres[2]).multiplyScalar(0.5).distanceTo(target)).toBeLessThan(1e-9);
    const deeper = contactCentres(target, { ...base, anchor: 'c1', depth: 2 }, 'L');
    // +2 mm deeper: contact 1 lies 2 mm from the target, on the far (deep) side of the trajectory
    expect(deeper.centres[1].distanceTo(target)).toBeCloseTo(2, 9);
    expect(deeper.centres[1].clone().sub(target).dot(deeper.dir)).toBeLessThan(0);
    expect(anchorOffset('c3', 1.5)).toBeCloseTo(3 * (LEAD.contactLength + 1.5) + LEAD.contactLength / 2, 9);
  });
  it('round-trips through the URL, and old links default to the array centre', () => {
    const s = defaultState();
    s.layers.electrode.on = true; s.lead = { ...s.lead, anchor: 'c1', depth: -1.5 };
    expect(decode(encode(s)).lead).toMatchObject({ anchor: 'c1', depth: -1.5 });
    expect(decode('#/atlas?i=pd&lead=0.5,0,60,15').lead.anchor).toBe('centre');
  });
});
