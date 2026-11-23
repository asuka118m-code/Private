// オフライン用キャッシュ + SNSからの「共有」受け取り
const CACHE = "recipe-app-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    (async () => {
      // 古い版のキャッシュ（古いアイコンなど）を消す
      for (const k of await caches.keys()) if (k !== CACHE && k !== "share-inbox") await caches.delete(k);
      await self.clients.claim();
    })()
  )
);

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname === "/share") {
    event.respondWith(
      (async () => {
        const form = await event.request.formData();
        const cache = await caches.open("share-inbox");
        const payload = {
          title: form.get("title") || "",
          text: form.get("text") || "",
          url: form.get("url") || "",
        };
        await cache.put("/share-inbox/meta", new Response(JSON.stringify(payload)));
        const files = form.getAll("images").filter((f) => f && typeof f !== "string");
        await cache.put("/share-inbox/count", new Response(String(files.length)));
        for (let i = 0; i < files.length; i++) {
          await cache.put(`/share-inbox/file-${i}`, new Response(files[i], { headers: { "content-type": files[i].type } }));
        }
        return Response.redirect("/import?shared=1", 303);
      })()
    );
    return;
  }
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") || url.origin !== location.origin) return;
  // ネットワーク優先、失敗時はキャッシュ
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(async () => (await caches.match(event.request)) || caches.match("/index.html"))
  );
});
