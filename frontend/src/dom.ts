export function node(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing DOM node: ${id}`);
  return el;
}

export function setText(id: string, value: string) {
  const el = node(id);
  if (el.textContent !== value) {
    el.textContent = value;
  }
}

export function setHTML(id: string, value: string) {
  const el = node(id);
  if (el.innerHTML !== value) {
    el.innerHTML = value;
  }
}

export function setDisabled(id: string, disabled: boolean) {
  const el = node(id) as HTMLButtonElement;
  el.disabled = disabled;
}