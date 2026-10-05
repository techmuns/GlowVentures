// A source-version mismatch is an app update, never a failed financial feed.
let changed = false;
const listeners = new Set<() => void>();
export const deploymentChanged = () => changed;
export function subscribeToDeployment(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function markDeploymentChanged() {
  changed = true;
  for (const listener of listeners) listener();
}
