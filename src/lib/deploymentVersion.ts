// A source-version mismatch is an app update, never a failed financial feed.
let changed = false;
let blocked = false;
const listeners = new Set<() => void>();
export const deploymentChanged = () => changed;
export const deploymentUpdateBlocked = () => blocked;
export function subscribeToDeployment(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function markDeploymentChanged() {
  if (changed) return;
  changed = true;
  for (const listener of listeners) listener();
}
export function setDeploymentUpdateBlocked(value: boolean) {
  if (blocked === value) return;
  blocked = value;
  for (const listener of listeners) listener();
}
