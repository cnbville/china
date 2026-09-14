-- 0003_triggers_and_constraints.sql
-- updated_at maintenance and the rank/reasons integrity rule.

-- updated_at is maintained by a trigger on both tables (plan section 3). It costs
-- nothing now and is the first thing any future conflict handling would need.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at
  before update on items
  for each row execute function set_updated_at();

create trigger sources_set_updated_at
  before update on sources
  for each row execute function set_updated_at();

-- "reasons" is required when a rank is set (plan section 1): without them, a
-- rank is meaningless four months later. Enforced in the DB so the rule holds
-- regardless of which client writes.
alter table sources
  add constraint sources_ranked_needs_reasons
  check (rank is null or array_length(reasons, 1) >= 1);
