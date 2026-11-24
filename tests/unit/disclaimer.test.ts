import { describe, expect, it } from 'vitest';
import { lastSentence } from '../../src/ui/shell';

// On a phone the notice is folded to "Teaching tool." and its own last sentence (the audit's UI-27): that sentence has
// to be the one that says what the site is not for, in each section's own words
describe('the notice folded on a phone', () => {
  it('keeps each section’s last sentence, word for word', () => {
    expect(lastSentence('Atlas-based (MNI 2009b) group anatomy; individual anatomy varies. Not for surgical planning.')).toBe('Not for surgical planning.');
    expect(lastSentence('One adult’s CT with another person’s ear (a cadaver specimen) registered into it: positions are approximate to a millimetre or two. Individual anatomy varies. Not for surgical planning.'))
      .toBe('Not for surgical planning.');
    expect(lastSentence('One adult CT (VerSe); anatomy, pedicle sizes and vessel positions vary between people and with deformity. Illustrative, not for surgical planning.'))
      .toBe('Illustrative, not for surgical planning.');
    expect(lastSentence('One adult’s normal CT angiogram: the vessels are this patient’s; every aneurysm, malformation and fistula is drawn onto them by rule, and the angiogram’s timing is a drawing. For teaching, not for diagnosis or planning.'))
      .toBe('For teaching, not for diagnosis or planning.');
    // (a decimal or a version number is not the end of a sentence)
    expect(lastSentence('Positions are within 0.5 mm. Not for surgical planning.')).toBe('Not for surgical planning.');
    expect(lastSentence('One sentence only.')).toBe('One sentence only.');
  });
});
