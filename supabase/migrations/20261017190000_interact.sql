create table if not exists public.interact_x_users (
  x_id text primary key, username text not null, display_name text, avatar_url text,
  access_token text, refresh_token text, updated_at timestamptz not null default now()
);
create table if not exists public.interact_launches (
  id uuid primary key default gen_random_uuid(), mint text not null, creator_x_id text not null,
  creator_username text not null, target_username text not null,
  action text not null check (action in ('keyword','like','reply','repost')),
  keyword text, claim_amount numeric not null default 1, claim_supply numeric not null default 100,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.interact_claims (
  id uuid primary key default gen_random_uuid(), launch_id uuid not null references public.interact_launches(id) on delete cascade,
  mint text not null, x_user_id text not null, x_username text not null, wallet_address text,
  proof jsonb not null default '{}'::jsonb, amount_tokens numeric not null, status text not null default 'queued',
  created_at timestamptz not null default now(), unique (launch_id, x_user_id)
);
create index if not exists interact_launches_mint_idx on public.interact_launches(mint, created_at desc);
create index if not exists interact_claims_mint_idx on public.interact_claims(mint, created_at desc);
alter table public.interact_x_users enable row level security;
alter table public.interact_launches enable row level security;
alter table public.interact_claims enable row level security;
drop policy if exists "public reads interact launches" on public.interact_launches;
create policy "public reads interact launches" on public.interact_launches for select using (true);
drop policy if exists "public reads interact claims" on public.interact_claims;
create policy "public reads interact claims" on public.interact_claims for select using (true);
