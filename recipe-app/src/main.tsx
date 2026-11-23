import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RecipeList } from "./pages/RecipeList";
import { RecipeDetail } from "./pages/RecipeDetail";
import { RecipeEdit } from "./pages/RecipeEdit";
import { ImportPage } from "./pages/ImportPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./styles.css";
import { initSync } from "./lib/useSync";

initSync();

if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register("/sw.js");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RecipeList />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/new" element={<RecipeEdit />} />
        <Route path="/recipe/:id" element={<RecipeDetail />} />
        <Route path="/recipe/:id/edit" element={<RecipeEdit />} />
        <Route path="/share" element={<ImportPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
