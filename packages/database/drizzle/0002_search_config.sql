-- Text search configuration used for resource indexing: English stemming with accent folding.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'edushare') THEN
    CREATE TEXT SEARCH CONFIGURATION edushare (COPY = english);
    ALTER TEXT SEARCH CONFIGURATION edushare
      ALTER MAPPING FOR hword, hword_part, word WITH unaccent, english_stem;
  END IF;
END
$$;
