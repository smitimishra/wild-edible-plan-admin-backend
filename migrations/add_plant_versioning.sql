ALTER TABLE public.plant_table
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS plant_table_identity_active_idx
  ON public.plant_table (LOWER(BTRIM(scientific_name)), latitude, longitude)
  WHERE deleted_at IS NULL;
