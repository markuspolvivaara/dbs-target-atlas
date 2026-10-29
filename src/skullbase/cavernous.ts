import { z } from 'zod';
import data from '../data/generated/sbv3-cavernous.json';

/**
 * Skull base v3's cavernous sinus as pipeline/skullbase_v3_cavernous.py models it on this CT: the landmarks it found
 * (the clinoids, the petrous apex, v3's foramina), the cavernous carotid's centre line, the sinus's size and lateral
 * wall, and the ten triangles' vertices, by side.
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
const Side = z.object({
  landmarks: z.object({ anteriorClinoid: V3, posteriorClinoid: V3, petrousApex: V3, orbitalFissure: V3, rotundum: V3, ovale: V3, lacerum: V3, opticCanal: V3 }),
  carotid: z.object({ line: z.array(V3).min(2), radius: z.array(z.number()), lengthMm: z.number() }),
  sinus: z.object({ mm3: z.number(), lo: V3, hi: V3, wall: z.array(z.number()).length(3) }),
  triangles: z.record(z.array(V3).length(3)),
});
const raw = data as unknown as Record<'landmarks' | 'carotid' | 'sinus' | 'triangles', Record<'R' | 'L', unknown>>;
export const CAVERNOUS = Object.fromEntries((['R', 'L'] as const).map((s) => [s, Side.parse({
  landmarks: raw.landmarks[s], carotid: raw.carotid[s], sinus: raw.sinus[s], triangles: raw.triangles[s],
})])) as Record<'R' | 'L', z.infer<typeof Side>>;
