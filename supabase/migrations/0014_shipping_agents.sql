-- 0014_shipping_agents.sql
-- The shipping-agent ranking table (/agents). One row per agent; the page does
-- all the maths (upcharge vs. market, all-in cost, baseline comparison).

create table shipping_agents (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default '',
  usd          numeric,                    -- $ charged for ¥1000, before processing fee
  eur          numeric,                    -- € charged for ¥1000, before processing fee
  processing   numeric,                    -- processing fee, %
  domestic_cny numeric,                    -- domestic shipping in China, ¥
  payment_fee  numeric,                    -- cheapest payment method fee, % (reference)
  is_baseline  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger shipping_agents_set_updated_at
  before update on shipping_agents
  for each row execute function set_updated_at();

alter table shipping_agents enable row level security;

create policy "authenticated full access" on shipping_agents
  for all to authenticated
  using (true) with check (true);
