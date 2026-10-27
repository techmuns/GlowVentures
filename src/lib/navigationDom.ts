/** Stable source-site names, qualified by a repeated row's identity when needed. */
export function navigationElements(root: HTMLElement, attribute: 'scroll' | 'details'): Map<string, HTMLElement> {
  const groups = new Map<string, HTMLElement[]>();
  for (const el of root.querySelectorAll<HTMLElement>(`[data-navigation-${attribute}]`)) {
    const name = el.getAttribute(`data-navigation-${attribute}`)!;
    groups.set(name, [...(groups.get(name) ?? []), el]);
  }
  const result = new Map<string, HTMLElement>();
  for (const [name, elements] of groups) {
    const counts = new Map<string, number>();
    for (const el of elements) {
      const identity: string[] = [];
      for (let parent: HTMLElement | null = el; parent && parent !== root; parent = parent.parentElement) {
        const key = [...parent.attributes].find(a => /^data-.*(?:key|account|security|entity|owner|fund|mandate|id)$/.test(a.name)
          && !a.name.startsWith('data-table-export') && a.value);
        if (key) identity.unshift(`${key.name}=${key.value}`);
      }
      const base = identity.length ? `${name}:${identity.join('/')}` : name;
      const n = counts.get(base) ?? 0; counts.set(base, n + 1);
      result.set(n ? `${base}:${n}` : base, el);
    }
  }
  return result;
}
