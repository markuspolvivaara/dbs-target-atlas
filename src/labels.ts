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

/** The labels' URL value: "all" and "off" always, "hover" when it is not the default here. (Relative to each device's
 * default, a link made on a tablet, where every name is the default, opened with names on hover on a desktop: the
 * audit's UI-13. Hover is the default wherever there is a pointer, so a link without the key means it there.) */
export function labelsParam(v: 'all' | 'hover' | 'off'): string | null {
  return v === 'all' ? 'a' : v === 'off' ? '0' : defaultLabels() === 'hover' ? null : 'h';
}

export function labelsFrom(lb: string | null): 'all' | 'hover' | 'off' {
  return lb === 'a' ? 'all' : lb === '0' ? 'off' : lb === 'h' ? 'hover' : defaultLabels();
}
