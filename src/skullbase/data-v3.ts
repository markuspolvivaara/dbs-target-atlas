/** The default model's (v3) generated data that only its page reads: one chunk, loaded by index.ts for that page. */
import definitions from '../data/generated/sbv3-definitions.json';
import landmarks from '../data/generated/sbv3-landmarks.json';
import manifest from '../data/generated/sbv3-manifest.json';

export default { manifest: manifest as unknown, landmarks: landmarks as unknown, definitions: definitions as unknown, regions: [] as unknown };
