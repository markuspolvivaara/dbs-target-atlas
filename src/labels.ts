/** The 3D labels' default: on a touch screen (a coarse pointer, no hover) every name is shown, as hovering cannot reveal
 * them there; elsewhere names show for the hovered or selected structure. A link states its setting when it differs. */
export function defaultLabels(): 'all' | 'hover' {
  try {
    return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches ? 'all' : 'hover';
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
