// Claude API による抽出（ANTHROPIC_API_KEY 等の認証情報がある場合のみ使用）
import Anthropic from "@anthropic-ai/sdk";

const RECIPE = {
  type: "object",
  properties: {
    title: { type: "string" },
    servings: { type: "string", description: "何人分など。不明なら空文字" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "材料名のみ" },
          amount: { type: "string", description: "分量。記載がなければ空文字" },
        },
        required: ["name", "amount"],
        additionalProperties: false,
      },
    },
    steps: { type: "array", items: { type: "string" }, description: "作る順の手順。番号は付けない" },
  },
  required: ["title", "servings", "ingredients", "steps"],
  additionalProperties: false,
};

const SCHEMA = {
  type: "object",
  properties: { recipes: { type: "array", items: RECIPE } },
  required: ["recipes"],
  additionalProperties: false,
};

const SYSTEM = `あなたは料理レシピの整理係です。与えられた画像やテキストからレシピを読み取り、JSONで返します。
- 材料は1つずつ分け、分量は amount に入れる（「大さじ1」「200g」「少々」など原文どおり）。
- 調味料のまとまり（A、合わせ調味料など）は名前に「(A) 醤油」のように付記する。
- 手順は作る順に1ステップずつ。番号や「STEP」は付けない。
- 書かれていない材料や手順を創作しない。レシピが読み取れない場合は空配列にする。
- 複数のレシピが含まれていれば、それぞれ別のレシピとして recipes に入れる。
- 日本語で出力する。`;

let client;
export function aiAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function extractWithClaude({ text, images = [] }) {
  client ??= new Anthropic();
  const content = [
    ...images.map((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    })),
    { type: "text", text: text ? `以下からレシピを抽出してください。\n\n${text}` : "この画像からレシピを抽出してください。" },
  ];
  const response = await client.beta.messages.create({
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw new Error("AIが解析を断りました");
  if (response.stop_reason === "max_tokens") throw new Error("レシピが長すぎて解析しきれませんでした");
  const out = response.content.find((b) => b.type === "text");
  if (!out) throw new Error("AIの応答が空でした");
  return JSON.parse(out.text).recipes ?? [];
}
