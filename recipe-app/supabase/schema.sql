-- あじめも：Supabaseの初期設定
-- Supabaseの「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押してください（1回だけ）。

-- ① レシピの表（1レシピ＝1行。中身はまるごとJSONで保存）
create table if not exists public.recipes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  data jsonb,
  updated_at bigint not null,          -- 端末で最後に変更した時刻
  deleted boolean not null default false,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists recipes_user_server_updated on public.recipes (user_id, server_updated_at);

-- 本人のデータしか読み書きできないようにする
alter table public.recipes enable row level security;
drop policy if exists "own recipes" on public.recipes;
create policy "own recipes" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2台で同じレシピを変更したとき、後から変更した方を残す
create or replace function public.recipes_keep_latest() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.updated_at <= old.updated_at then
    return old;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists recipes_keep_latest on public.recipes;
create trigger recipes_keep_latest before update on public.recipes
  for each row execute function public.recipes_keep_latest();

-- ② 写真・画像の保存場所（非公開。本人のフォルダだけ読み書き可）
insert into storage.buckets (id, name, public) values ('recipe-images', 'recipe-images', false)
  on conflict (id) do nothing;

drop policy if exists "recipe images select" on storage.objects;
drop policy if exists "recipe images insert" on storage.objects;
drop policy if exists "recipe images update" on storage.objects;
drop policy if exists "recipe images delete" on storage.objects;
create policy "recipe images select" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recipe images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recipe images update" on storage.objects for update to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recipe images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-images' and (storage.foldername(name))[1] = auth.uid()::text);
