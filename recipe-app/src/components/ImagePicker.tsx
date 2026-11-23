import { useRef } from "react";
import { shrinkImage } from "../lib/image";

export function ImagePicker({ label, onPick, multiple = true, capture }: {
  label: string; onPick: (blobs: Blob[]) => void; multiple?: boolean; capture?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn" onClick={() => ref.current?.click()}>{label}</button>
      <input
        ref={ref} type="file" accept="image/*" multiple={multiple} hidden
        {...(capture ? { capture: "environment" } : {})}
        onChange={async (e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onPick(await Promise.all(files.map((f) => shrinkImage(f))));
        }}
      />
    </>
  );
}
