alter table public.orders
  add column if not exists is_paid boolean not null default false,
  add column if not exists delivery_driver text,
  add column if not exists cashier_name text;

select pg_notify('pgrst', 'reload schema');
