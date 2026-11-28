// SNS投稿の「全文」キャプションを取る（リンクのプレビュー用の説明文は途中で切れていることがあるため）
import * as cheerio from "cheerio";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const get = (url, accept = "text/html") =>
  fetch(url, { headers: { "user-agent": UA, "accept-language": "ja,en;q=0.8", accept }, signal: AbortSignal.timeout(10000) });

/** Instagram の埋め込み表示（ログイン不要）のHTMLからキャプションを取り出す */
export function instagramEmbedCaption(html) {
  const $ = cheerio.load(html);
  const cap = $(".Caption").first();
  if (!cap.length) return "";
  cap.find(".CaptionUsername, .CaptionComments").remove();
  cap.find("br").replaceWith("\n");
  return cap.text().replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

/** YouTube のページに入っている概要欄の全文 */
export function youtubeDescription(html) {
  const m = String(html).match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (!m) return "";
  try { return JSON.parse(`"${m[1]}"`).trim(); } catch { return ""; }
}

/** 投稿のURLから全文キャプションを探す。取れなければ "" */
export async function fetchFullCaption(target, html) {
  const host = target.hostname.replace(/^www\./, "");
  try {
    if (/(^|\.)instagram\.com$/i.test(host)) {
      const code = target.pathname.match(/\/(?:p|reels?|tv)\/([\w-]+)/)?.[1];
      if (!code) return "";
      const r = await get(`https://www.instagram.com/p/${code}/embed/captioned/`);
      return r.ok ? instagramEmbedCaption(await r.text()) : "";
    }
    if (/(^|\.)tiktok\.com$/i.test(host)) {
      const r = await get(`https://www.tiktok.com/oembed?url=${encodeURIComponent(target.href)}`, "application/json");
      if (!r.ok) return "";
      const j = await r.json();
      return String(j.title || "").trim();
    }
    if (/(^|\.)(youtube\.com|youtu\.be)$/i.test(host) && html) return youtubeDescription(html);
  } catch { /* 取れなければプレビューの説明文を使う */ }
  return "";
}

/** SNSのページの題名（「○○ on Instagram: …」など）から投稿者名の部分を外す */
export function snsTitle(title) {
  let s = String(title || "").trim();
  if (/instagram|threads|facebook/i.test(s)) {
    const m = s.match(/[:：]\s*["“「](.*?)["”」]?\s*$/);
    return m ? m[1] : "";
  }
  return s.replace(/\s*[|｜-]\s*(TikTok|YouTube)\s*$/i, "").replace(/\s*\|\s*.*?\(@[\w.]+\).*$/, "").trim();
}
