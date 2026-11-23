import type { Comment } from "../lib/types";

const fmtDate = (t: number) => new Date(t).toLocaleDateString("ja-JP", { year: "numeric", month: "short", day: "numeric" });

/** 感想コメントの一覧。共有リンクから届いたものには名前を付ける */
export function CommentList({ comments, selfLabel, onDelete }: {
  comments: Comment[]; selfLabel: string; onDelete?: (c: Comment) => void;
}) {
  const sorted = [...comments].sort((a, b) => b.createdAt - a.createdAt);
  return (
    <ul className="comments">
      {sorted.map((c) => (
        <li key={c.id} className={c.shared ? "from-guest" : "from-owner"}>
          <div className="c-head">
            <b className="c-author">{c.shared ? c.author : selfLabel}</b>
            <span>{fmtDate(c.createdAt)}</span>
            {c.rating && <span className="stars">{"★".repeat(c.rating)}</span>}
            {onDelete && <button className="link small" onClick={() => onDelete(c)}>削除</button>}
          </div>
          <p className="pre">{c.text}</p>
        </li>
      ))}
    </ul>
  );
}
