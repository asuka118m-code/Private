import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { exportBackup, importBackup } from "../lib/backup";

export function SettingsPage() {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function doExport() {
    setBusy(true);
    try {
      const n = await exportBackup();
      if (n) setMsg(`${n}件のレシピを書き出しました`);
    } catch (e) {
      setMsg(`失敗しました：${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function doImport(f: File) {
    setBusy(true);
    try {
      const { added, updated } = await importBackup(f);
      setMsg(`復元しました（追加 ${added}件・更新 ${updated}件）`);
    } catch (e) {
      setMsg(`失敗しました：${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="back">‹ 戻る</Link>
        <h1>バックアップ</h1>
      </header>
      <section className="panel">
        <h2>書き出し</h2>
        <p className="hint">全レシピ・画像・コメントを1つのファイルに保存します。iPhone/iPadでは「"ファイル"に保存」からiCloud Driveに保存しておくと安心です。</p>
        <button className="btn primary" disabled={busy} onClick={doExport}>バックアップを書き出す</button>
      </section>
      <section className="panel">
        <h2>読み込み（復元・別の端末へ移す）</h2>
        <p className="hint">バックアップファイルを読み込みます。今あるレシピは消えず、同じレシピは新しい方が残ります。</p>
        <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>ファイルを選ぶ</button>
        <input ref={ref} type="file" accept="application/json,.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) doImport(f); }} />
      </section>
      {msg && <div className="panel"><p className="pre">{msg}</p></div>}
    </div>
  );
}
