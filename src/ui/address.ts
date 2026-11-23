/**
 * A section page keeps its address in step with its view both ways: it writes the view's hash (replacing the history
 * entry, a moment after a change) and it reads a hash that a link, Back or the address bar put there. The two can
 * cross. The address changes at once when the reader follows a link, but the page only hears of it with the
 * hashchange event, a task later: a write that is due in between would put the old view's hash back, the page would
 * then find the address equal to its own view, and the link would have done nothing.
 *
 * So the page writes only over the hash it last wrote or read: any other is a change still to be read.
 *
 * A write replaces the history entry, or adds one (`push`): the page adds one when the reader goes to another view
 * (another indication, group or region), so that Back steps through the views looked at and not straight out of the
 * section (the site audit's UI-13); the camera, a slider or a selection only replace.
 */
type History = Record<'replaceState' | 'pushState', (data: unknown, unused: string, url: string) => void>;

export interface AddressSync {
  /** The page has just read the address (at its start, or in a hashchange). */
  read(): void;
  /** Write the view's hash, unless the address has changed under the page. `push`: as a new history entry. */
  write(hash: string, push?: boolean): void;
}

export function addressSync(win: { location: { hash: string }; history: History } = window): AddressSync {
  let known = win.location.hash;
  return {
    read() { known = win.location.hash; },
    write(hash, push = false) {
      if (win.location.hash !== known) return;
      // (a browser may refuse: Safari allows 100 in 30 seconds. The view is not held up for it; the next write catches up.)
      try { if (hash !== win.location.hash) win.history[push ? 'pushState' : 'replaceState'](null, '', hash); } catch { /* refused */ }
      known = win.location.hash;   // (as the browser gives it back, which need not be letter for letter what was written)
    },
  };
}
