import { z } from '../zod';
import { SB_MODEL } from './index';
import v3data from '../data/generated/sbv3-cavernous.json';
import v1data from '../data/generated/sb-cavernous.json';

/**
 * The cavernous sinus as pipeline/skullbase_v3_cavernous.py models it on v3's CT, or (Skull base v1)
 * pipeline/skullbase_v1_cavernous.py draws it on the Z-Anatomy model: the landmarks (the clinoids, the petrous apex, the
 * foramina), the cavernous carotid's centre line, the sinus's size and lateral wall, and the ten triangles' vertices, by side.
 */
const V3 = z.tuple([z.number(), z.number(), z.number()]);
const Side = z.object({
  landmarks: z.object({ anteriorClinoid: V3, posteriorClinoid: V3, petrousApex: V3, orbitalFissure: V3, rotundum: V3, ovale: V3, lacerum: V3, opticCanal: V3 }),
  carotid: z.object({ line: z.array(V3).min(2), radius: z.array(z.number()), lengthMm: z.number() }),
  sinus: z.object({ mm3: z.number(), lo: V3, hi: V3, wall: z.array(z.number()).length(3) }),
  triangles: z.record(z.string(), z.array(V3).length(3)),
});
type Data = Record<'landmarks' | 'carotid' | 'sinus' | 'triangles', Record<'R' | 'L', unknown>>;
const parse = (raw: Data) => Object.fromEntries((['R', 'L'] as const).map((s) => [s, Side.parse({
  landmarks: raw.landmarks[s], carotid: raw.carotid[s], sinus: raw.sinus[s], triangles: raw.triangles[s],
})])) as Record<'R' | 'L', z.infer<typeof Side>>;
/** Each model's, and the one this page shows. */
export const CAVERNOUS_V3 = parse(v3data as unknown as Data);
export const CAVERNOUS_V1 = parse(v1data as unknown as Data);
export const CAVERNOUS = SB_MODEL === 'v3' ? CAVERNOUS_V3 : CAVERNOUS_V1;
