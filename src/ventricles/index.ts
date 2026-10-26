import { z } from 'zod';
import veLandmarks from '../data/generated/ve-landmarks.json';
import veManifestJson from '../data/generated/ve-manifest.json';
import veTrajectories from '../data/generated/ve-trajectories.json';
import veEtv from '../data/generated/ve-etv.json';
import { VeManifestSchema } from '../data/schema';
import { BsReferenceSchema, ClaimSchema, type Claim } from '../brainstem/schema';
import { ACCURACY, AQUEDUCT, ETV_ANATOMY, ETV_TRAJECTORY, FOURTH, HYDRO, IDEAL, KOCHER, LATERAL_WALLS, MONRO, PRACTICE, THIRD_FLOOR } from './content';
import { VE_REFERENCES } from './references';

/**
 * Ventricles section data (pipeline/ventricles_build.py), in Skull base v2's frame: this CT's ventricles completed by
 * the Z-Anatomy model fitted onto them, the foramina of Monro, its bone and the template brain fitted into it (Skull
 * base v3), the skull's landmarks and the trajectories from Kocher's point.
 */
export const VE_MANIFEST = VeManifestSchema.parse(veManifestJson);
export const VE = new Map(VE_MANIFEST.structures.map((s) => [s.id, s]));

const V3 = z.tuple([z.number(), z.number(), z.number()]);
const LandmarkSchema = z.object({ id: z.string(), name: z.string(), ras: V3, side: z.enum(['L', 'R', 'M']), how: z.string() });
export type VeLandmark = z.infer<typeof LandmarkSchema>;
export const LANDMARKS = z.array(LandmarkSchema).parse(veLandmarks);
export const LM = new Map(LANDMARKS.map((l) => [l.id, l]));

export const TARGETS = ['IMC', 'MAM', 'CMC', 'P'] as const;
export type Target = (typeof TARGETS)[number];
const TrajectorySchema = z.object({
  kocher: z.enum(['chen', 'park']), side: z.enum(['L', 'R']), offsetMm: z.number(), target: z.enum(TARGETS),
  entry: V3, direction: V3, aim: V3.optional(), angleToNormalDeg: z.number(), boneMm: z.number(),
  ventricle: z.enum(['L', 'R']).nullable(), depthMm: z.number().optional(), insideMm: z.number().optional(), entersAt: V3.optional(),
  nearestSide: z.enum(['L', 'R']).optional(), missMm: z.number().optional(),
});
export type Trajectory = z.infer<typeof TrajectorySchema>;
const TrajFileSchema = z.object({
  midline: z.number(),
  ventricles: z.object({
    /** as far as the CT shows them (the fluid below the threshold) */
    volumeMl: z.object({ R: z.number(), L: z.number(), third: z.number(), fourth: z.number() }),
    frontalHorns: z.object({ widthMm: z.number(), atZ: z.number(), innerSkullMm: z.number(), evansIndex: z.number() }),
    /** as drawn: completed by the fitted model, softened and drawn a little outside */
    drawnMl: z.object({ R: z.number(), L: z.number(), third: z.number(), fourth: z.number(), aqueduct: z.number(), monroR: z.number(), monroL: z.number() }),
    /** the Z-Anatomy model's fit onto the CT's ventricles, and checks of it on the CT */
    fit: z.object({
      fitMedianMm: z.number(), fitP90Mm: z.number(), jacobianMin: z.number(), monroRadiusMm: z.number(),
      monro: z.record(z.object({ gapMm: z.number() })),
      temporalHorn: z.record(z.object({ insideHu: z.number(), aroundHu: z.number() })),
      monroCt: z.record(z.object({ insideHu: z.number(), aroundHu: z.number() })),
      aqueduct: z.object({ modelLengthMm: z.number(), courseMm: z.number(), gapToThirdMm: z.number(), gapToFourthMm: z.number() }),
      aqueductCt: z.object({ insideHu: z.number(), aroundHu: z.number() }),
      fourthCt: z.object({ insideHu: z.number(), aroundHu: z.number() }),
      fourthFitMedianMm: z.number(), drawnPieces: z.number(),
    }),
  }),
  canthusMm: z.number(),
  params: z.object({
    csfHu: z.number(), smoothMm: z.number(), depthMm: z.number(), kocher: z.record(z.number()), kocherAnteriorMm: z.number(), apOffsets: z.array(z.number()), maxDepthMm: z.number(),
    fitPairMm: z.number(), fitBackMm: z.number(), monroAreaMm2: z.number(), aqueductMm: z.tuple([z.number(), z.number(), z.number()]), softMm: z.number(), drawOutMm: z.number(),
  }),
  trajectories: z.array(TrajectorySchema),
});
export const TRAJ = TrajFileSchema.parse(veTrajectories);
export function trajectoryFor(kocher: string, side: string, offsetMm: number, target: string): Trajectory | undefined {
  return TRAJ.trajectories.find((t) => t.kocher === kocher && t.side === side && t.offsetMm === offsetMm && t.target === target);
}

/** The endoscopic third ventriculostomy on this CT (ventricles_etv.py): the AC-PC frame, the target and the landmarks
 * around it, Sousa 2025's line through each foramen of Monro, and checks against the published positions. */
const EtvTrajectorySchema = z.object({
  entry: V3, direction: V3, target: V3, monro: V3, depthMm: z.number(), depthToMonroMm: z.number(), fromMidlineMm: z.number(),
  fromCoronalSutureMm: z.number(), sagittalAngleDeg: z.number(), coronalAngleDeg: z.number(),
});
export type EtvTrajectory = z.infer<typeof EtvTrajectorySchema>;
const YZ = z.tuple([z.number(), z.number()]);
export const ETV = z.object({
  mammillary: z.object({ modelAcpcMm: YZ, placedAcpcMm: YZ, daSilvaAcpcMm: YZ, movedMm: z.number() }),
  acpcLengthMm: z.number(),
  wallsMovedMm: z.record(z.number()),
  infundibularRecessAcpcMm: YZ, targetAcpcMm: YZ, basilarApexAcpcMm: YZ, targetToBasilarApexMm: z.number(),
  frame: z.object({ origin: V3, y: V3, z: V3 }),
  points: z.object({ target: V3, infundibularRecess: V3, basilarApex: V3, mammillaryBodies: V3, monro: z.object({ R: V3, L: V3 }) }),
  trajectories: z.object({ R: EtvTrajectorySchema, L: EtvTrajectorySchema }),
  /** the hydrocephalus shape: what it measures (rest and shaped), and the target, foramina and line with it */
  hydrocephalus: z.object({
    rest: z.object({ evansIndex: z.number(), frontalHornsMm: z.number(), thirdWidthMm: z.number(), floorToApexMm: z.number() }),
    hydrocephalus: z.object({ evansIndex: z.number(), frontalHornsMm: z.number(), thirdWidthMm: z.number(), floorToApexMm: z.number() }),
    goal: z.object({ evansIndex: z.number(), thirdWidthMm: z.number(), floorToApexMm: z.number() }),
    maxMoveMm: z.number(), jacobianMinAround: z.number(),
    points: z.object({ target: V3, monro: z.object({ R: V3, L: V3 }), mammillaryBodies: V3 }),
    trajectories: z.object({ R: EtvTrajectorySchema, L: EtvTrajectorySchema }),
  }),
}).parse(veEtv);

export const VE_REFS = z.array(BsReferenceSchema).parse(VE_REFERENCES);
export const VE_REF = new Map(VE_REFS.map((r) => [r.id, r]));

export type Kind = 'ventricle' | 'bone' | 'brain' | 'deep' | 'vessel' | 'nerve' | 'brainstem';
export const kindOf = (id: string): Kind => {
  const st = VE.get(id);
  const c = st?.category;
  if (c === 'ventricle' || c === 'brain' || c === 'deep') return c;
  if (c === 'artery' || c === 'vein') return 'vessel';
  if (c === 'nerve') return 'nerve';
  if (c === 'hindbrain') return 'brainstem';
  return 'bone';
};
export const KIND_LABEL: Record<Kind, string> = {
  ventricle: 'Ventricle (this CT, completed by a fitted model)', bone: 'Bone (this CT)', brain: 'Brain (fitted template)',
  deep: 'Around the ventricles (fitted model)', vessel: 'Vessel (this CT angiogram)', nerve: 'Cranial nerve (routed through this CT)',
  brainstem: 'Brainstem (fitted model)',
};

/** Cross-checks between content, references and the generated files. Returns problems (empty = consistent). */
export function crossCheckVe(): string[] {
  const errs: string[] = [];
  const used = new Set<string>();
  const all: Claim[] = [...LATERAL_WALLS, ...MONRO, ...THIRD_FLOOR, ...AQUEDUCT, ...FOURTH, ...KOCHER, ...IDEAL, ...PRACTICE, ...Object.values(ACCURACY).flat(),
    ...ETV_ANATOMY, ...ETV_TRAJECTORY, ...HYDRO];
  for (const cl of all) {
    ClaimSchema.parse(cl);
    for (const r of cl.refIds) { used.add(r); if (!VE_REF.has(r)) errs.push(`unknown refId ${r}`); }
  }
  for (const r of VE_REFS) if (!used.has(r.id)) errs.push(`reference ${r.id} is never cited`);
  for (const t of TARGETS) if (!ACCURACY[t]?.length) errs.push(`no published accuracy for ${t}`);
  for (const k of Object.keys(TRAJ.params.kocher)) for (const s of ['L', 'R']) for (const o of TRAJ.params.apOffsets) for (const t of TARGETS) {
    if (!trajectoryFor(k, s, o, t)) errs.push(`no trajectory ${k} ${s} ${o} ${t}`);
  }
  for (const id of ['ve_lateral_ventricle', 've_third_ventricle', 've_interventricular_foramen', 've_cerebral_aqueduct', 've_fourth_ventricle']) if (!VE.has(id)) errs.push(`missing structure ${id}`);
  return errs;
}

const problems = crossCheckVe();
if (problems.length) throw new Error('Ventricles content inconsistent:\n' + problems.join('\n'));
