import { useEffect, useState } from "react";
import { loadSharedImage } from "../lib/share";
import { StoredImage } from "./StoredImage";

/** 共有リンクから見る写真（クラウドから読み込む） */
export function SharedImage({ ownerId, id, className, onClick }: { ownerId: string; id: string; className?: string; onClick?: () => void }) {
  const [blob, setBlob] = useState<Blob | null | undefined>(undefined);
  useEffect(() => { let ok = true; loadSharedImage(ownerId, id).then((b) => ok && setBlob(b)); return () => { ok = false; }; }, [ownerId, id]);
  if (blob === null) return <div className={`img-placeholder ${className ?? ""}`} />;
  return blob ? <StoredImage blob={blob} className={className} onClick={onClick} /> : <div className={`img-placeholder ${className ?? ""}`} />;
}
