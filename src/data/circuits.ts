/**
 * The circuits the DBS targets sit on, explained (the site audit's A-014, the owner's choices of 16 November 2026: a
 * sourced paragraph and a schematic per circuit on the indication's card; the basal ganglia loop, the tremor loop and
 * the circuit of Papez).
 *
 * Sources, all open access and read in full: Galvan 2015 (PMC4318426) and Chiken 2016 (PMC4871171) for the basal
 * ganglia; Gallay 2008 (PMC2494572), Akram 2018 (PMC5790021) and Coenen 2020 (PMC7156360) for the cerebellothalamic
 * tract; Senova 2020 (PMC7231447), Schaper 2020 (PMC8210468) and Piper 2022 (PMC9586548) for the circuit of Papez.
 *
 * The schematics are drawings, not anatomy: boxes for the nodes, arrows for the connections. A connection is marked
 * excitatory or inhibitory only where a source says which (glutamatergic or GABAergic); dopamine's two effects are
 * shown as such; any other connection is drawn plain.
 */
export type CircuitId = 'bg' | 'tremor' | 'papez';
export type EdgeKind = 'excitatory' | 'inhibitory' | 'dopamine' | 'plain';

export interface CircuitNode {
  id: string;
  /** the box's lines */
  label: string[];
  /** the box: left, top, width (its height follows from its lines) */
  x: number; y: number; w: number;
  /** the drawn structures it stands for (the first is selected on a click); none: not drawn in this section */
  links: string[];
  /** colour token of its outline (a drawn structure's) */
  token?: string;
}
export interface CircuitEdge {
  from: string; to: string; kind: EdgeKind;
  /** what it is (its tooltip and accessible name) */
  name: string;
  /** the SVG path, from the source box's edge to the target's */
  d: string;
  /** a short label written beside it, and where */
  tag?: { text: string; x: number; y: number; anchor?: 'start' | 'middle' | 'end' };
  /** the drawn tracts it stands for (a click selects the first) */
  links?: string[];
}
export interface CircuitStatement { text: string; refIds: string[]; /** shown only for these indications */ only?: string[] }
export interface Circuit {
  id: CircuitId; name: string; width: number; height: number;
  nodes: CircuitNode[]; edges: CircuitEdge[];
  text: CircuitStatement[];
}

/** one box line's height and the box's padding (the renderer and the layout below agree on them) */
export const LINE_H = 13;
export const BOX_PAD = 8;
export const boxHeight = (n: CircuitNode) => n.label.length * LINE_H + BOX_PAD;

export const CIRCUITS: Record<CircuitId, Circuit> = {
  bg: {
    id: 'bg', name: 'Basal ganglia: direct, indirect and hyperdirect pathways', width: 380, height: 292,
    nodes: [
      { id: 'ctx', label: ['Motor cortex'], x: 140, y: 8, w: 215, links: ['m1', 'sma', 'presma'], token: 'ctxM1' },
      { id: 'snc', label: ['SNc', '(dopamine)'], x: 25, y: 66, w: 90, links: ['snc'], token: 'snc' },
      { id: 'd1', label: ['Striatum', 'D1 neurons'], x: 140, y: 66, w: 95, links: ['putamen', 'caudate'], token: 'str' },
      { id: 'd2', label: ['Striatum', 'D2 neurons'], x: 260, y: 66, w: 95, links: ['putamen', 'caudate'], token: 'str' },
      { id: 'thal', label: ['Motor thalamus', '(VA/VL)'], x: 25, y: 140, w: 90, links: ['vo', 'thal'], token: 'vo' },
      { id: 'gpe', label: ['GPe'], x: 260, y: 140, w: 95, links: ['gpe'], token: 'gpe' },
      { id: 'stn', label: ['STN'], x: 260, y: 200, w: 95, links: ['stn'], token: 'stn' },
      { id: 'gpi', label: ['GPi / SNr'], x: 140, y: 262, w: 95, links: ['gpi', 'snr'], token: 'gpi' },
    ],
    edges: [
      { from: 'ctx', to: 'd1', kind: 'excitatory', name: 'Cortex to striatum (glutamatergic)', d: 'M187,29 L187,66' },
      { from: 'ctx', to: 'd2', kind: 'excitatory', name: 'Cortex to striatum (glutamatergic)', d: 'M307,29 L307,66' },
      { from: 'ctx', to: 'stn', kind: 'excitatory', name: 'Hyperdirect pathway: cortex to STN (glutamatergic)', d: 'M355,18 C378,50 378,180 355,210',
        tag: { text: 'hyperdirect', x: 371, y: 128, anchor: 'end' }, links: ['hdp'] },
      { from: 'snc', to: 'd1', kind: 'dopamine', name: 'Dopamine to D1 neurons: excites the direct pathway', d: 'M115,83 L140,83' },
      { from: 'snc', to: 'd2', kind: 'dopamine', name: 'Dopamine to D2 neurons: inhibits the indirect pathway', d: 'M70,100 C90,124 250,124 282,100' },
      { from: 'd1', to: 'gpi', kind: 'inhibitory', name: 'Direct pathway: striatum to GPi/SNr (GABAergic)', d: 'M187,100 L187,262',
        tag: { text: 'direct', x: 192, y: 190, anchor: 'start' } },
      { from: 'd2', to: 'gpe', kind: 'inhibitory', name: 'Indirect pathway: striatum to GPe (GABAergic)', d: 'M307,100 L307,140',
        tag: { text: 'indirect', x: 302, y: 132, anchor: 'end' } },
      { from: 'gpe', to: 'stn', kind: 'inhibitory', name: 'Indirect pathway: GPe to STN (GABAergic)', d: 'M307,161 L307,200' },
      { from: 'stn', to: 'gpi', kind: 'excitatory', name: 'STN to GPi/SNr (glutamatergic)', d: 'M282,221 L220,262' },
      { from: 'gpi', to: 'thal', kind: 'inhibitory', name: 'GPi to the motor thalamus (GABAergic): the ansa lenticularis and lenticular fasciculus', d: 'M140,273 L76,273 Q70,273 70,267 L70,174',
        links: ['al', 'lf'] },
      { from: 'thal', to: 'ctx', kind: 'plain', name: 'Motor thalamus back to motor cortex', d: 'M25,157 L12,157 Q6,157 6,151 L6,24 Q6,18 12,18 L140,18' },
    ],
    text: [
      { text: 'Cortical input reaches the basal ganglia through the striatum and the subthalamic nucleus. Their output nuclei, the GPi and the SNr, project to the motor thalamus (VA/VL), which projects back to motor cortex. The STN’s projection neurons are glutamatergic (excitatory); those of the GPe, GPi, SNr and striatum are GABAergic (inhibitory).', refIds: ['galvan2015'] },
      { text: 'The direct pathway runs from striatal neurons carrying D1 receptors straight to the GPi/SNr; the indirect pathway from neurons carrying D2 receptors through the GPe and STN. The hyperdirect pathway runs from the cortex to the STN and on to the GPi/SNr: it reaches the output nuclei sooner than the two pathways through the striatum. Dopamine excites the direct pathway’s neurons and inhibits the indirect pathway’s.', refIds: ['galvan2015', 'chiken2016'] },
      { text: 'In the classic rate model of Parkinson’s disease, dopamine loss quietens the direct pathway and drives the indirect one: the GPe slows, the STN is released from its inhibition, and the GPi and SNr fire more and inhibit the thalamus. Besides firing rates, parkinsonism changes firing patterns, oscillations and synchrony across the circuit.', refIds: ['galvan2015', 'chiken2016'], only: ['pd'] },
      { text: 'The GPi’s output reaches the thalamus through the ansa lenticularis and the lenticular fasciculus, mainly the VLa (approximately Voa), with only minor projections to the VLp, where cerebellar fibres end; the two overlap in part. The GPi and SNr also send collaterals to the centromedian and parafascicular nuclei, which project to the striatum.', refIds: ['gallay2008', 'ilinsky2018', 'galvan2015'] },
      { text: 'Drawn here as the hyperdirect pathway: a motor STN tract whose cortical ends lie mostly in the pre-SMA and SMA.', refIds: [] },
    ],
  },
  tremor: {
    id: 'tremor', name: 'Tremor: the cerebello-thalamo-cortical pathway', width: 380, height: 232,
    nodes: [
      { id: 'm1', label: ['Primary motor', 'cortex (M1)'], x: 120, y: 8, w: 95, links: ['m1'], token: 'ctxM1' },
      { id: 'vim', label: ['Vim (VLp)'], x: 120, y: 76, w: 95, links: ['vim'], token: 'vim' },
      { id: 'rn', label: ['Red nucleus', 'region'], x: 120, y: 130, w: 95, links: ['rn'], token: 'rn' },
      { id: 'dec', label: ['Decussation of the', 'sup. cerebellar ped.'], x: 110, y: 194, w: 115, links: [] },
      { id: 'den_c', label: ['Dentate nucleus', '(other side)'], x: 5, y: 194, w: 90, links: ['dentate'], token: 'den' },
      { id: 'den_i', label: ['Dentate nucleus', '(same side)'], x: 245, y: 194, w: 90, links: ['dentate'], token: 'den' },
    ],
    edges: [
      { from: 'den_c', to: 'dec', kind: 'plain', name: 'Cerebellothalamic fibres in the superior cerebellar peduncle, most of them crossing', d: 'M95,215 L110,215', links: ['drtt'] },
      { from: 'dec', to: 'rn', kind: 'plain', name: 'Through and in front of the red nucleus (decussating DRTT)', d: 'M167,194 L167,164', links: ['drtt'] },
      { from: 'rn', to: 'vim', kind: 'plain', name: 'Into the motor thalamus, mainly the VLp (decussating DRTT)', d: 'M167,130 L167,97', links: ['drtt'] },
      { from: 'vim', to: 'm1', kind: 'plain', name: 'Vim to primary motor cortex', d: 'M167,76 L167,42' },
      { from: 'den_i', to: 'vim', kind: 'plain', name: 'Non-decussating DRTT: from the dentate nucleus on the same side', d: 'M290,194 C290,130 260,87 215,87',
        tag: { text: 'non-decussating', x: 298, y: 150, anchor: 'start' }, links: ['ndrtt'] },
    ],
    text: [
      { text: 'The cerebellothalamic tract leaves the cerebellar nuclei, chiefly the dentate, through the superior cerebellar peduncle. Most of its fibres cross at the peduncle’s decussation, pass through and in front of the red nucleus, and enter the motor thalamus, mainly the VLp (Hassler’s Vim).', refIds: ['gallay2008'] },
      { text: 'The Vim lies on the cerebello-thalamo-cortical network that links the primary motor cortex with the dentate nucleus of the opposite cerebellum. In tremor DBS, good responses came from contacts in the thalamic area most connected with that dentate nucleus.', refIds: ['akram2018'] },
      { text: 'Part of the dentato-rubro-thalamic tract does not cross: drawn here as the non-decussating DRTT. At both the Vim and the PSA, tremor control tracks how close the active contact is to the DRTT.', refIds: ['coenen2020', 'poster'] },
      { text: 'The pallidal fibres to the thalamus end mainly in the VLa, the cerebellar ones in the VLp, overlapping in part: Holmes tremor involves both circuits.', refIds: ['gallay2008', 'holmesgpi'], only: ['holmes'] },
    ],
  },
  papez: {
    id: 'papez', name: 'The circuit of Papez', width: 360, height: 212,
    nodes: [
      { id: 'mamm', label: ['Mammillary', 'body'], x: 5, y: 8, w: 90, links: ['mamm'], token: 'mb' },
      { id: 'ant', label: ['Anterior thalamic', 'nucleus (ANT)'], x: 120, y: 8, w: 105, links: ['ant'], token: 'ant' },
      { id: 'cing', label: ['Cingulate', 'cortex'], x: 250, y: 8, w: 85, links: ['acc'], token: 'ctxACC' },
      { id: 'hip', label: ['Hippocampal', 'formation'], x: 5, y: 170, w: 90, links: ['hippocampus'], token: 'hip' },
      { id: 'phg', label: ['Parahippocampal', 'and entorhinal'], x: 235, y: 170, w: 100, links: [] },
    ],
    edges: [
      { from: 'hip', to: 'mamm', kind: 'plain', name: 'Fornix: subiculum to the mammillary bodies', d: 'M50,170 L50,42', tag: { text: 'fornix', x: 55, y: 110, anchor: 'start' }, links: ['fornix'] },
      { from: 'hip', to: 'ant', kind: 'plain', name: 'Fornix: subiculum directly to the anterior thalamic nuclei', d: 'M95,178 C150,160 172,100 172,42', links: ['fornix'] },
      { from: 'mamm', to: 'ant', kind: 'plain', name: 'Mammillothalamic tract', d: 'M95,25 L120,25', tag: { text: 'MTT', x: 107, y: 54, anchor: 'middle' }, links: ['mtt'] },
      { from: 'ant', to: 'cing', kind: 'plain', name: 'Thalamocingulate fibres', d: 'M225,25 L250,25' },
      { from: 'cing', to: 'phg', kind: 'plain', name: 'Cingulum, to the parahippocampal gyrus and entorhinal cortex', d: 'M292,42 L292,170', tag: { text: 'cingulum', x: 297, y: 110, anchor: 'start' } },
      { from: 'phg', to: 'hip', kind: 'plain', name: 'Back to the hippocampus', d: 'M235,191 L95,191' },
    ],
    text: [
      { text: 'The fornix carries the subiculum’s output to the mammillary bodies and directly to the anterior thalamic nuclei.', refIds: ['senova2020'] },
      { text: 'The mammillothalamic tract runs from the mammillary bodies to the medioventral ANT. Within the circuit of Papez the ANT receives its major input from the hippocampal formation through this tract, and it has reciprocal connections with the cortex, among them thalamocingulate fibres.', refIds: ['schaper2020'] },
      { text: 'The ANT feeds back to the hippocampus through the cingulum to the parahippocampal gyrus and entorhinal cortex. The circuit is a route of seizure spread between the hippocampus and the thalamus, and ANT stimulation may suppress spread along it.', refIds: ['piper2022'] },
      { text: 'Drawn here for the cingulate cortex: the anterior cingulate. The parahippocampal gyrus and entorhinal cortex are not drawn.', refIds: [] },
    ],
  },
};

/** Which circuits each indication's card explains. */
export const CIRCUITS_FOR: Record<string, CircuitId[]> = {
  pd: ['bg'], gdys: ['bg'], cdys: ['bg'], fhd: ['bg'], md: ['bg'], tard: ['bg'], ts: ['bg'], chorea: ['bg'],
  et: ['tremor'], holmes: ['tremor', 'bg'], epi: ['papez'],
};
