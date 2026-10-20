/* Stack of open overlays (modals, popovers) so Escape only closes the topmost one. */
let counter = 0;
const stack: number[] = [];

export function pushOverlay(): number {
  const id = ++counter;
  stack.push(id);
  return id;
}

export function popOverlay(id: number) {
  const i = stack.lastIndexOf(id);
  if (i >= 0) stack.splice(i, 1);
}

export function isTopOverlay(id: number): boolean {
  return stack[stack.length - 1] === id;
}

export function overlayCount(): number {
  return stack.length;
}
