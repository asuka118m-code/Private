// ローカル実行用（npm start）。Vercelでは api/index.mjs が使われる
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import app from "./app.mjs";
import { aiAvailable } from "./ai.mjs";

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`RecipeBox: http://localhost:${port}  (AI: ${aiAvailable() ? "ON" : "OFF"})`));
