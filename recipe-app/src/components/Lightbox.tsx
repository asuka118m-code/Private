import { StoredImage } from "./StoredImage";
export function Lightbox({ id, onClose }: { id: string | null; onClose: () => void }) {
  if (!id) return null;
  return (
    <div className="lightbox" onClick={onClose}>
      <StoredImage id={id} />
    </div>
  );
}
