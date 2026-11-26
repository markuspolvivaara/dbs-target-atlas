/**
 * Which of the section's three models a page shows: <meta name="sb-model" content="ct"> (v2) or "v3" (the default
 * model); without it, the Z-Anatomy model (v1). Its own module, so that the per-model data (index.ts, trigeminal.ts) can
 * read it without importing each other.
 */
export type SbModel = 'zanatomy' | 'ct' | 'v3';
const META = typeof document !== 'undefined' ? document.querySelector<HTMLMetaElement>('meta[name="sb-model"]')?.content : undefined;
export const SB_MODEL: SbModel = META === 'ct' || META === 'v3' ? META : 'zanatomy';
