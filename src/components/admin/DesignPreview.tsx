"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/client";

// Downloaded blobs per storage key, shared by every preview on the page (files never change: spec §10.5).
const cache = new Map<string, Promise<string | null>>();

/**
 * Downloads the design with the staff member's own session and shows it from a local blob: URL whose type is
 * forced to the server-checked type (finalize sniffed the magic bytes), so Chrome renders a PDF in its viewer
 * and an image as an image, and nothing else. A sandboxed cross-origin frame can't host Chrome's PDF viewer.
 */
function useBlobUrl(storageKey: string, mime: string): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  useEffect(() => {
    let alive = true;
    if (!cache.has(storageKey)) {
      cache.set(
        storageKey,
        getBrowserSupabase()
          .storage.from("submissions")
          .download(storageKey)
          .then(({ data }) => (data ? URL.createObjectURL(new Blob([data], { type: mime })) : null))
          .catch(() => null),
      );
    }
    cache.get(storageKey)!.then((url) => alive && setState({ url, failed: !url }));
    return () => {
      alive = false;
    };
  }, [storageKey, mime]);
  return state;
}

export function DesignPreview({ storageKey, mime, className = "" }: { storageKey: string; mime: string; className?: string }) {
  const { url, failed } = useBlobUrl(storageKey, mime);
  if (failed) return <div className={`flex items-center justify-center bg-raised text-sm text-danger ${className}`}>Couldn&apos;t load the file</div>;
  if (!url) return <div className={`flex items-center justify-center bg-raised text-sm text-muted ${className}`}>Loading…</div>;
  if (mime === "application/pdf") {
    return <iframe src={`${url}#toolbar=0&navpanes=0&view=FitH`} title="Design (PDF)" className={`bg-white ${className}`} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Submitted design" className={`bg-raised object-contain ${className}`} />;
}
