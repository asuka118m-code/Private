import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getSharedList, type SharedList } from "../lib/share";
import { SharedListPage } from "./SharedListPage";
import { SharedRecipePage } from "./SharedRecipePage";

/** /s/:token を開いた時：一覧の共有なら一覧、1品の共有ならそのレシピ */
export function SharedEntryPage() {
  const { token = "" } = useParams();
  const [list, setList] = useState<SharedList | null | undefined>(undefined);
  useEffect(() => { getSharedList(token).then(setList).catch(() => setList(null)); }, [token]);
  if (list === undefined) return <div className="page"><p className="empty">読み込み中…</p></div>;
  return list ? <SharedListPage token={token} list={list} /> : <SharedRecipePage />;
}
