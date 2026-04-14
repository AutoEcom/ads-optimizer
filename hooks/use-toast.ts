"use client";

import { useEffect, useState } from "react";

export type ToastItem = {
  id: string;
  title?: string;
  description?: string;
};

let listeners: Array<(toasts: ToastItem[]) => void> = [];
let memoryToasts: ToastItem[] = [];

function emit(toasts: ToastItem[]) {
  memoryToasts = toasts;
  listeners.forEach((listener) => listener(toasts));
}

function createToast(payload: Omit<ToastItem, "id">) {
  const id = crypto.randomUUID();
  const next = [...memoryToasts, { id, ...payload }];
  emit(next);

  setTimeout(() => {
    emit(memoryToasts.filter((toast) => toast.id !== id));
  }, 2800);
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>(memoryToasts);

  useEffect(() => {
    listeners.push(setToasts);
    return () => {
      listeners = listeners.filter((listener) => listener !== setToasts);
    };
  }, []);

  return {
    toasts,
    toast: createToast
  };
}
