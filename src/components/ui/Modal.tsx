"use client";

import { useEffect, useRef } from "react";

/** Native <dialog>: focus trap, Escape to close and an inert background for free. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto w-[min(92vw,520px)] rounded-lg border border-line bg-surface p-0 text-paper backdrop:bg-black/70"
    >
      <div className="space-y-4 p-6">
        <h2 className="font-display text-3xl">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
