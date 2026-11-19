/**
 * Indirect-coordinate calculator, ported from the attached dbs-targets.html
 * (renderCoords). Values relative to the mid-commissural point; ranges follow
 * standard teaching coordinates (calgary). Logic unchanged.
 */
export type Side = 'Left' | 'Right';

export interface CalcRow {
  k: string;
  c: string;
  lat: number;
  latR: string;
  ap: number;
  apR: string;
  z: number;
  zR: string;
}

export function fmt(n: number): string {
  // (the size rounded, then the sign: Math.round gave −6.2 for −6.25 beside 6.3 for 6.25, the audit's A-022)
  const s = (Math.round(Math.abs(n) * 10) / 10).toFixed(1);
  return n < 0 && s !== '0.0' ? '−' + s : s;
}

export function validate(acpcLength: number, v3Width: number): string | null {
  if (!(acpcLength >= 18 && acpcLength <= 35)) return 'Enter an AC–PC length between 18 and 35 mm.';
  if (!(v3Width >= 0 && v3Width <= 20)) return 'Enter a third-ventricle width between 0 and 20 mm.';
  return null;
}

export function rows(acpcLength: number, v3Width: number): CalcRow[] {
  const L = acpcLength;
  const half = v3Width / 2;
  return [
    { k: 'STN', c: 'stn', lat: 12, latR: '11–13 from midline', ap: -3.5, apR: '3–4 posterior', z: -4.5, zR: '4–5 below' },
    { k: 'GPi', c: 'gpi', lat: 20, latR: '19–21 from midline', ap: 2.5, apR: '2–3 anterior', z: -4.5, zR: '4–5 below' },
    // (the point at 3/12, the anterior end of Guiot's 2/12 to 3/12; the range printed, as for the STN and GPi: B2, A-010)
    { k: 'Vim', c: 'vim', lat: half + 11.5, latR: '11–12 from ventricle wall', ap: -0.25 * L, apR: fmt(L / 6) + '–' + fmt(0.25 * L) + ' anterior to PC (2/12 to 3/12 of AC–PC)', z: 0, zR: 'AC–PC plane' },
  ];
}

export function words(t: CalcRow, side: Side): string {
  return (
    fmt(t.lat) + ' mm ' + side.toLowerCase() + ' of midline, ' +
    fmt(Math.abs(t.ap)) + ' mm ' + (t.ap >= 0 ? 'in front of' : 'behind') + ' the MCP, ' +
    (t.z === 0 ? 'in the AC–PC plane.' : fmt(Math.abs(t.z)) + ' mm below the AC–PC plane.')
  );
}

export function signed(t: CalcRow, side: Side): [number, number, number] {
  const sgn = side === 'Right' ? 1 : -1;
  return [sgn * t.lat, t.ap, t.z];
}

export const CALC_NOTE = {
  pre: 'Ranges follow standard teaching coordinates',
  preRefs: ['calgary', 'sammartino2016'],
  mid: '. Only the Vim uses the two measurements: the STN and GPi rows are fixed offsets from the MCP. The Vim point is the anterior end of its range (3/12 of the AC–PC length in front of the PC), and the fraction is approximate. Atrophy, ventricle size and AC–PC length shift where the STN really lies',
  midRefs: ['stnanat2025'],
  post: ', so confirm every target on direct imaging and with physiology.',
};
export const CALC_LEDE = 'Atlas starting points relative to the mid-commissural point. Use them to check a plan, not to make one.';
