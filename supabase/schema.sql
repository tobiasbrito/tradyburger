create extension if not exists pgcrypto;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,
  price integer not null check (price >= 0),
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text,
  delivery_type text not null check (delivery_type in ('retiro', 'envio')),
  address text,
  payment_method text not null,
  total integer not null check (total >= 0),
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmado', 'preparado', 'entregado', 'cancelado')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  subtotal integer not null check (subtotal >= 0)
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  whatsapp_number text not null,
  address text not null,
  opening_hours text not null,
  delivery_enabled boolean not null default true,
  delivery_cost integer not null default 0 check (delivery_cost >= 0)
);

create table if not exists public.bot_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_phone text,
  step text not null default 'saludo',
  state jsonb not null default '{}'::jsonb,
  cart jsonb not null default '[]'::jsonb,
  last_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

drop trigger if exists bot_sessions_set_updated_at on public.bot_sessions;
create trigger bot_sessions_set_updated_at
before update on public.bot_sessions
for each row execute function public.set_updated_at();

alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.settings enable row level security;
alter table public.bot_sessions enable row level security;

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
on public.products for select
to anon
using (is_active = true);

drop policy if exists "Public can read settings" on public.settings;
create policy "Public can read settings"
on public.settings for select
to anon
using (true);

-- Admin writes and order management are performed by Netlify Functions
-- using SUPABASE_SERVICE_ROLE_KEY. Do not expose that key in the frontend.
