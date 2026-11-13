/** Skull base v2's (the CT model's) generated data that only its page reads: one chunk, loaded by index.ts for that page. */
import definitions from '../data/generated/sbct-definitions.json';
import landmarks from '../data/generated/sbct-landmarks.json';
import manifest from '../data/generated/sbct-manifest.json';
import regions from '../data/generated/sbct-regions.json';

export default { manifest: manifest as unknown, landmarks: landmarks as unknown, definitions: definitions as unknown, regions: regions as unknown };
