-- あじめも：共有リンクとコメント（2回目の設定）
-- Supabaseの「SQL Editor」にこのファイルの中身を全部貼り付けて「Run」を押してください（1回だけ）。

-- ① 共有リンク（リンクを知っている人だけがレシピを見てコメントできる）
create table if not exists public.shares (
  token text primary key,                     -- URLに入る推測できない文字列
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  recipe_id text not null,
  owner_name text not null default '',        -- 相手に見せる作り手の名前
  revoked boolean not null default false,     -- 共有を止めたら true
  created_at timestamptz not null default now()
);
create index if not exists shares_user_recipe on public.shares (user_id, recipe_id);
alter table public.shares enable row level security;
drop policy if exists "own shares" on public.shares;
create policy "own shares" on public.shares
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ② 共有先からのコメント
create table if not exists public.shared_comments (
  id uuid primary key default gen_random_uuid(),
  token text not null references public.shares (token) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,  -- レシピの持ち主
  recipe_id text not null,
  author text not null check (char_length(author) between 1 and 40),
  text text not null check (char_length(text) between 1 and 2000),
  rating int check (rating between 1 and 5),
  created_at timestamptz not null default now()
);
create index if not exists shared_comments_recipe on public.shared_comments (user_id, recipe_id, created_at);
alter table public.shared_comments enable row level security;
-- 持ち主は読む・消すだけ（書き込みは下の関数からのみ）
drop policy if exists "owner reads comments" on public.shared_comments;
drop policy if exists "owner deletes comments" on public.shared_comments;
create policy "owner reads comments" on public.shared_comments for select using (auth.uid() = user_id);
create policy "owner deletes comments" on public.shared_comments for delete using (auth.uid() = user_id);

-- ③ リンクからレシピを読む（ログインなしでも、正しいリンクなら読める）
create or replace function public.get_shared_recipe(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'recipe', r.data,
    'ownerId', s.user_id,
    'ownerName', s.owner_name,
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'author', c.author, 'text', c.text, 'rating', c.rating,
        'createdAt', (extract(epoch from c.created_at) * 1000)::bigint) order by c.created_at desc)
      from public.shared_comments c
      where c.user_id = s.user_id and c.recipe_id = s.recipe_id), '[]'::jsonb))
  from public.shares s
  join public.recipes r on r.user_id = s.user_id and r.id = s.recipe_id
  where s.token = p_token and not s.revoked and not r.deleted
$$;

-- ④ リンクからコメントを書く（短時間に大量に書かれないよう制限つき）
create or replace function public.add_shared_comment(p_token text, p_author text, p_text text, p_rating int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.shares;
  c public.shared_comments;
begin
  select * into s from public.shares where token = p_token and not revoked;
  if not found then raise exception 'この共有リンクは使えません'; end if;
  if (select count(*) from public.shared_comments x where x.token = p_token and x.created_at > now() - interval '1 hour') >= 30 then
    raise exception 'コメントが多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.shared_comments (token, user_id, recipe_id, author, text, rating)
  values (p_token, s.user_id, s.recipe_id, left(trim(p_author), 40), left(trim(p_text), 2000),
          case when p_rating between 1 and 5 then p_rating end)
  returning * into c;
  return jsonb_build_object('id', c.id, 'author', c.author, 'text', c.text, 'rating', c.rating,
    'createdAt', (extract(epoch from c.created_at) * 1000)::bigint);
end $$;

-- ⑤ 共有中のレシピの写真だけ、リンクから見られるようにする
create or replace function public.is_shared_image(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shares s
    join public.recipes r on r.user_id = s.user_id and r.id = s.recipe_id
    where not s.revoked and not r.deleted
      and s.user_id::text = split_part(p_name, '/', 1)
      and ((r.data -> 'sourceImageIds') ? split_part(p_name, '/', 2)
        or (r.data -> 'photoIds') ? split_part(p_name, '/', 2)))
$$;

revoke all on function public.get_shared_recipe(text) from public;
revoke all on function public.add_shared_comment(text, text, text, int) from public;
revoke all on function public.is_shared_image(text) from public;
grant execute on function public.get_shared_recipe(text) to anon, authenticated;
grant execute on function public.add_shared_comment(text, text, text, int) to anon, authenticated;
grant execute on function public.is_shared_image(text) to anon, authenticated;

drop policy if exists "shared recipe images" on storage.objects;
create policy "shared recipe images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'recipe-images' and public.is_shared_image(name));
