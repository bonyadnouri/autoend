-- Evidence bucket for autoend Run artifacts (WebM video + screenshots).
--
-- autoend publishes with the open-RLS `anon` key (see autoend
-- src/publish/supabase-client.ts), so the bucket is provisioned here rather
-- than created at runtime with an elevated key.
--
-- SECURITY: this bucket is PUBLIC — objects are world-readable at a guessable
-- URL. This matches the hackathon-demo posture of 001_schema.sql (open anon
-- policies) and is NOT production-safe. Point autoend at environments where
-- exposing evidence video/screenshots is acceptable.

insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', true)
on conflict (id) do update set public = true;

-- Postgres CREATE POLICY has no IF NOT EXISTS, so drop-then-create keeps this
-- migration idempotent (safe to re-run).

-- Public read of evidence objects (the UI renders hosted video/images).
drop policy if exists "public_read_evidence" on storage.objects;
create policy "public_read_evidence"
  on storage.objects for select
  using (bucket_id = 'evidence');

-- Anon upload / overwrite / prune, so a Run can publish and clean prior Runs.
drop policy if exists "anon_insert_evidence" on storage.objects;
create policy "anon_insert_evidence"
  on storage.objects for insert to anon
  with check (bucket_id = 'evidence');

drop policy if exists "anon_update_evidence" on storage.objects;
create policy "anon_update_evidence"
  on storage.objects for update to anon
  using (bucket_id = 'evidence')
  with check (bucket_id = 'evidence');

drop policy if exists "anon_delete_evidence" on storage.objects;
create policy "anon_delete_evidence"
  on storage.objects for delete to anon
  using (bucket_id = 'evidence');
