// 材料の印（A・B・★など）の表示
const COLORS = ["#e8743b", "#3b8de8", "#3bab6b", "#a35ad6", "#d6a21e", "#d64b6a", "#2aa3a3", "#7a6a5b"];

export function markColor(mark: string) {
  const order = ["A", "B", "C", "D", "E", "★", "☆", "◎", "○", "●", "◆", "◇", "■", "□", "※", "♪"];
  const i = order.indexOf(mark);
  return COLORS[(i < 0 ? mark.charCodeAt(0) : i) % COLORS.length];
}

export function MarkBadge({ mark, onClick, active }: { mark: string; onClick?: () => void; active?: boolean }) {
  const style = { "--mk": markColor(mark) } as React.CSSProperties;
  return onClick ? (
    <button type="button" className={`mark-badge ${active ? "active" : ""}`} style={style} onClick={onClick} aria-label={`${mark}の材料を見る`}>{mark}</button>
  ) : (
    <span className="mark-badge" style={style}>{mark}</span>
  );
}
