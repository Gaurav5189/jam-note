export const toast = (message: string) =>
  window.dispatchEvent(new CustomEvent("jam:toast", { detail: message }));

export const inkBurst = (x: number, y: number) =>
  window.dispatchEvent(new CustomEvent("jam:ink-burst", { detail: { x, y } }));
