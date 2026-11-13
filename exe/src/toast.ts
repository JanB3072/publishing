import type { Tone } from './types';

export interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

type Listener = (item: ToastItem) => void;
const listeners = new Set<Listener>();
let seq = 0;

export function toast(message: string, tone: Tone = 'info') {
  const item: ToastItem = { id: ++seq, message, tone };
  listeners.forEach((fn) => fn(item));
}

export function subscribeToast(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
