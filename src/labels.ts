/** The 3D labels' default: on a touch screen with room for them (a tablet: a coarse pointer, no hover) every name is
 * shown, as hovering cannot reveal them there; elsewhere names show for the pointed-at or selected structure. A phone
 * is the exception among touch screens: every name at once buries the model there (44 labels on the skull base's
 * cranial floor), so a tap names a structure. A link states its setting when it differs. */
export function defaultLabels(): 'all' | 'hover' {
  try {
    if (typeof matchMedia !== 'function') return 'hover';
    const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    const phone = matchMedia('(max-width: 599px), (max-height: 599px)').matches;
    return touch && !phone ? 'all' : 'hover';
  } catch {
    return 'hover';
  }
}

/** The labels' URL value (none when it is the default here). */
export function labelsParam(v: 'all' | 'hover' | 'off'): string | null {
  return v === defaultLabels() ? null : v === 'all' ? 'a' : v === 'off' ? '0' : 'h';
}

export function labelsFrom(lb: string | null): 'all' | 'hover' | 'off' {
  return lb === 'a' ? 'all' : lb === '0' ? 'off' : lb === 'h' ? 'hover' : defaultLabels();
}
