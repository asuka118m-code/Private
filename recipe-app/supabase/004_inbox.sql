-- あじめも：あとで登録ボックス（4回目の設定）
-- ログインなし（プライベートブラウズでも）で、ショートカットから自分専用のボックスにURLを保存する

create table if not exists public.inbox (
  id uuid primary key default gen_random_uuid(),
  token text not null references public.shares (token) on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  url text check (url is null or (char_length(url) <= 1000 and url ~ '^https?://')),
  text text not null default '' check (char_length(text) <= 2000),
  done boolean not null default false,
  accepted_recipe_id text,
  created_at timestamptz not null default now()
);
create index if not exists inbox_user on public.inbox (user_id, done, created_at);
alter table public.inbox enable row level security;
drop policy if exists "owner reads inbox" on public.inbox;
drop policy if exists "owner updates inbox" on public.inbox;
drop policy if exists "owner deletes inbox" on public.inbox;
create policy "owner reads inbox" on public.inbox for select using (auth.uid() = user_id);
create policy "owner updates inbox" on public.inbox for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner deletes inbox" on public.inbox for delete using (auth.uid() = user_id);

-- ボックス用のリンク（shares の recipe_id が '__inbox__'）からだけ保存できる。中身を読むことはできない
create or replace function public.add_inbox(p_token text, p_url text, p_text text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.shares;
  i public.inbox;
  link text := nullif(trim(coalesce(p_url, '')), '');
begin
  select * into s from public.shares where token = p_token and not revoked and recipe_id = '__inbox__';
  if not found then raise exception 'このリンクは使えません'; end if;
  if link is not null and (link !~ '^https?://' or char_length(link) > 1000) then raise exception 'URLが正しくありません'; end if;
  if link is null and coalesce(trim(p_text), '') = '' then raise exception '保存するものがありません'; end if;
  if (select count(*) from public.inbox x where x.token = p_token and x.created_at > now() - interval '1 hour') >= 60 then
    raise exception '保存が多すぎます。しばらくしてからお試しください';
  end if;
  insert into public.inbox (token, user_id, url, text)
  values (p_token, s.user_id, link, left(coalesce(trim(p_text), ''), 2000))
  returning * into i;
  return jsonb_build_object('id', i.id, 'url', i.url, 'text', i.text,
    'createdAt', (extract(epoch from i.created_at) * 1000)::bigint);
end $$;

revoke all on function public.add_inbox(text, text, text) from public;
grant execute on function public.add_inbox(text, text, text) to anon, authenticated;
