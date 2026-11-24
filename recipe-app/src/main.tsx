import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RecipeList } from "./pages/RecipeList";
import { RecipeDetail } from "./pages/RecipeDetail";
import { RecipeEdit } from "./pages/RecipeEdit";
import { ImportPage } from "./pages/ImportPage";
import { SettingsPage } from "./pages/SettingsPage";
import { CategoriesPage } from "./pages/CategoriesPage";
import { CategorySelectPage } from "./pages/CategorySelectPage";
import { SharedRecipePage } from "./pages/SharedRecipePage";
import { SharedEntryPage } from "./pages/SharedEntryPage";
import { RequestsPage } from "./pages/RequestsPage";
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
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/categories/:id/select" element={<CategorySelectPage />} />
        <Route path="/s/:token" element={<SharedEntryPage />} />
        <Route path="/s/:token/r/:recipeId" element={<SharedRecipePage />} />
        <Route path="/requests" element={<RequestsPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
