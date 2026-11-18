import { useEffect, useState } from "react";
import { getImage } from "../lib/db";

/** IndexedDBに保存した画像を表示 */
export function StoredImage({ id, blob, alt = "", className, onClick }: {
  id?: string; blob?: Blob; alt?: string; className?: string; onClick?: () => void;
}) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let url: string | undefined;
    let alive = true;
    (async () => {
      const b = blob ?? (id ? await getImage(id) : undefined);
      if (b && alive) setSrc((url = URL.createObjectURL(b)));
    })();
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [id, blob]);
  if (!src) return <div className={`img-placeholder ${className ?? ""}`} />;
  return <img src={src} alt={alt} className={className} onClick={onClick} loading="lazy" />;
}
