import { useEffect, useState } from "react";
import { createShare, getActiveShare, getOwnerName, revokeShare, shareUrl, updateShareName, type ShareInfo } from "../lib/share";
import { syncNow, useSyncState } from "../lib/useSync";
import { Link } from "react-router-dom";

/** レシピの共有リンクを作る・送る・止める */
export function ShareDialog({ recipeId, title, onClose }: { recipeId: string; title: string; onClose: () => void }) {
  const sync = useSyncState();
  const [share, setShare] = useState<ShareInfo | null | undefined>(undefined);
  const [name, setName] = useState(getOwnerName());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!sync.session) return;
    getActiveShare(recipeId).then((s) => { setShare(s); if (s?.ownerName) setName(s.ownerName); }).catch((e) => setMsg(e.message));
  }, [recipeId, sync.session]);

  const run = async (f: () => Promise<void>) => {
    setBusy(true); setMsg("");
    try { await f(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  async function create() {
    await run(async () => {
      await syncNow(); // レシピをクラウドに送ってから共有する
      setShare(await createShare(recipeId, name.trim()));
    });
  }

  async function send() {
    if (!share) return;
    const url = shareUrl(share.token);
    const text = `「${title}」のレシピです。作って食べた感想をコメントしてね`;
    if (navigator.share) {
      try { await navigator.share({ title, text, url }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    await navigator.clipboard?.writeText(url);
    setMsg("リンクをコピーしました。LINEなどに貼り付けて送ってください");
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>「{title}」を共有</h2>
          <button type="button" className="link" onClick={onClose}>閉じる</button>
        </div>
        {!sync.enabled ? <p className="hint">共有にはクラウドの設定が必要です。</p> :
          !sync.session ? <p className="hint">共有するにはログインしてください。<Link to="/settings" className="link">ログインへ</Link></p> :
          share === undefined ? <p className="hint">確認中…</p> : (
          <>
            <p className="hint">リンクを送った相手は、ログインなしでこのレシピを見て、感想をコメントできます。届いたコメントは、このレシピの「感想・コメント」に表示されます。</p>
            <label className="field">相手に表示するあなたの名前
              <input className="input" value={name} maxLength={40} placeholder="例：あすか" onChange={(e) => setName(e.target.value)}
                onBlur={() => share && name.trim() && name.trim() !== share.ownerName && run(async () => { await updateShareName(share.token, name.trim()); setShare({ ...share, ownerName: name.trim() }); })} />
            </label>
            {share ? (
              <>
                <div className="share-url">{shareUrl(share.token)}</div>
                <button className="btn primary wide" disabled={busy} onClick={send}>リンクを送る</button>
                <button className="link small danger" disabled={busy}
                  onClick={() => confirm("共有を止めますか？送ったリンクは開けなくなります（届いたコメントは残ります）") &&
                    run(async () => { await revokeShare(share.token); setShare(null); setMsg("共有を止めました"); })}>共有を止める</button>
              </>
            ) : (
              <button className="btn primary wide" disabled={busy || !name.trim()} onClick={create}>{busy ? "作成中…" : "共有リンクを作る"}</button>
            )}
          </>
        )}
        {msg && <p className="hint">{msg}</p>}
      </div>
    </div>
  );
}
