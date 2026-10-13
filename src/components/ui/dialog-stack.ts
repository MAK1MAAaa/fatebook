// Radix manages focus traps; this shared stack also orders independent dialogs
// and lets fixed game controls suspend input while any dialog is present.
const layers: symbol[] = [];
type FocusTarget = Pick<HTMLElement, 'isConnected' | 'focus' | 'matches' | 'closest'>;
const contents = new Map<symbol, FocusTarget>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());

export function subscribeDialogs(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function dialogCount() { return layers.length; }
export function dialogPosition(layer: symbol) { return layers.indexOf(layer); }
export function isTopDialog(layer: symbol) { return layers.at(-1) === layer; }
export function pushDialog(layer: symbol, content?: FocusTarget | null) {
  if (content) contents.set(layer, content);
  if (!layers.includes(layer)) { layers.push(layer); emit(); }
  return () => {
    const index = layers.indexOf(layer);
    contents.delete(layer);
    if (index >= 0) { layers.splice(index, 1); emit(); }
  };
}

export function restoreDialogFocus(closing: symbol, opener: FocusTarget | null) {
  const available = (target?: FocusTarget | null) => !!target?.isConnected && !target.matches(':disabled') && !target.closest('[inert]');
  if (available(opener)) { opener!.focus(); return true; }
  // Removing a card can remove the button that opened its confirmation.
  // The previous dialog remains a useful keyboard focus target in that case.
  const previous = [...layers].reverse().find(layer => layer !== closing && available(contents.get(layer)));
  if (previous) { contents.get(previous)!.focus(); return true; }
  return false;
}
