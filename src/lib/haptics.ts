"use client";

import { haptic } from "ios-haptics";

export function triggerHaptic() {
  try {
    haptic();
  } catch {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(10);
    }
  }
}

export function withHaptics<T extends (...args: any[]) => void>(handler?: T) {
  return ((...args: Parameters<T>) => {
    triggerHaptic();
    if (handler) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      handler(...args);
    }
  }) as T;
}
