import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { acceptFriend, friendInviteUrl, getFriendCodeOwner, getFriendRecipes, getOrCreateFriendCode, listFriends, removeFriend, resetFriendCode, type Friend } from "../lib/friends";
import type { SharedList } from "../lib/share";
import { useSyncState } from "../lib/useSync";
import { getMyName } from "../lib/profile";
import { SharedListPage } from "./SharedListPage";

/** 友だち一覧と、友だち招待リンク */
export function FriendsPage() {
  const sync = useSyncState();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    if (!sync.session) return;
    listFriends().then(setFriends);
    getMyName().then(setMyName);
  }, [sync.session]);

  if (!sync.session) {
    return <div className="page"><header className="topbar"><Link to="/" className="back">‹ 一覧</Link><h1>👥 友だち</h1></header>
      <p className="hint">友だち機能を使うにはログインしてください。<Link to="/settings" className="link">ログインへ</Link></p></div>;
  }

  async function invite() {
    setMsg("");
    try {
      const c = code ?? (await getOrCreateFriendCode());
      setCode(c);
      const url = friendInviteUrl(c);
      const text = "あじめもで友だちになろう！リンクを開いて「友だちになる」を押してね";
      if (navigator.share) { try { await navigator.share({ title: "あじめも", text, url }); return; } catch (e) { if ((e as Error).name === "AbortError") return; } }
      await navigator.clipboard?.writeText(url);
      setMsg("招待リンクをコピーしました。LINEなどで送ってください");
    } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">‹ 一覧</Link>
        <h1>👥 友だち</h1>
      </header>
      {myName === "" && <Link to="/settings" className="notice">👤 先に名前を登録してください（友だちに表示されます） ›</Link>}
      <section className="panel">
        <h2>友だちを招待</h2>
        <p className="hint small">招待リンクを送って、相手が開いて「友だちになる」を押すとつながります。相手もあじめものアカウントが必要です。友だちどうしは、お互いのレシピを見て、コメント・リクエスト・「自分のレシピに登録」ができます（編集はできません）。</p>
        <button className="btn primary" onClick={invite}>招待リンクを送る</button>
        {code && (
          <>
            <div className="share-url">{friendInviteUrl(code)}</div>
            <button className="link small" onClick={async () => {
              if (!confirm("招待リンクを作り直しますか？前のリンクは使えなくなります（今の友だちはそのまま）")) return;
              setCode(await resetFriendCode(code)); setMsg("作り直しました");
            }}>招待リンクを作り直す</button>
          </>
        )}
        {msg && <p className="hint small">{msg}</p>}
      </section>
      <section className="panel">
        <h2>友だち</h2>
        {friends === null ? <p className="hint">読み込み中…</p> : friends.length === 0 ? <p className="hint">まだいません。</p> : (
          <ul className="friend-list">
            {friends.map((f) => (
              <li key={f.id}>
                <Link to={`/friends/${f.id}`} className="friend-link">👤 {f.name}さんのレシピ ›</Link>
                <button className="link small" onClick={async () => {
                  if (!confirm(`${f.name}さんとの友だちを解除しますか？お互いのレシピが見られなくなります`)) return;
                  await removeFriend(f.id); setFriends(friends.filter((x) => x.id !== f.id));
                }}>解除</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** 招待リンクを開いた時：「○○さんと友だちになりますか？」 */
export function FriendAcceptPage() {
  const { code = "" } = useParams();
  const sync = useSyncState();
  const nav = useNavigate();
  const [owner, setOwner] = useState<{ name: string; self: boolean; already: boolean } | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!sync.session) return;
    getFriendCodeOwner(code).then(setOwner).catch((e) => { setErr(e.message); setOwner(null); });
  }, [code, sync.session]);

  return (
    <div className="page">
      <header className="topbar"><Link to="/" className="back">‹ あじめも</Link><h1>友だち招待</h1></header>
      <section className="panel">
        {!sync.session ? (
          <>
            <p>友だちになるには、あじめものアカウントでログインしてください。</p>
            <Link to="/settings" className="btn primary">ログインする</Link>
            <p className="hint small">ログインしたら、もう一度このリンクを開いてください。</p>
          </>
        ) : owner === undefined ? <p className="hint">確認中…</p> : !owner ? (
          <p>この招待リンクは使えません。{err && <><br /><small>{err}</small></>}</p>
        ) : owner.self ? (
          <p>これはあなたの招待リンクです。相手に送ってください。</p>
        ) : owner.already ? (
          <><p>{owner.name}さんとは、もう友だちです。</p><Link to="/friends" className="btn">友だち一覧へ</Link></>
        ) : (
          <>
            <h2>{owner.name || "この人"}さんと友だちになりますか？</h2>
            <p className="hint">お互いのレシピを見て、コメントやリクエストを送れるようになります。いつでも解除できます。</p>
            <button className="btn primary wide" onClick={async () => {
              try { const f = await acceptFriend(code); nav(`/friends/${f.id}`); } catch (e) { setErr((e as Error).message); }
            }}>友だちになる</button>
            {err && <div className="error">{err}</div>}
          </>
        )}
      </section>
    </div>
  );
}

/** /friends/:friendId — 友だちのレシピ一覧 */
export function FriendRecipesRoute() {
  const { friendId = "" } = useParams();
  const [list, setList] = useState<SharedList | null | undefined>(undefined);
  const [err, setErr] = useState("");
  useEffect(() => { getFriendRecipes(friendId).then(setList).catch((e) => { setErr(e.message); setList(null); }); }, [friendId]);
  if (list === undefined) return <div className="page"><p className="empty">読み込み中…</p></div>;
  if (!list) return <div className="page"><header className="topbar"><Link to="/friends" className="back">‹ 友だち</Link></header><div className="empty">見られません（友だちが解除された可能性があります）。{err && <><br /><small>{err}</small></>}</div></div>;
  return <SharedListPage token="" list={list} friendId={friendId} />;
}
