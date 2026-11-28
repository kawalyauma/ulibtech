-- Correct the catalogue against the cover of the eight-page public download.
-- Run with psql -v reverse=false -v dry_run=true first. Set dry_run=false to apply.
-- To undo, set reverse=true. The guards reject intervening edits to the affected fields.
\set ON_ERROR_STOP on
-- Missing either parameter forces an error before any write.
SELECT :'reverse'::boolean AS reverse, :'dry_run'::boolean AS dry_run \gset
BEGIN;
SET LOCAL lock_timeout = '3s';
\set corrected 'P6 SIPRO Integrated Science End of Term 3 Past Paper (2022)'
\set original 'p 6 sipro end term 3'
\set summary 'Primary Six Integrated Science examination from SIPRO Educational Services Limited, Kampala. Term 3, 2022. The paper has two sections and allows 2 hours 15 minutes.'
\if :reverse
UPDATE resources SET title=:'original', subject_id=NULL,
 academic_year_id=(SELECT id FROM academic_years WHERE year=2024), short_description=NULL, updated_at=now()
WHERE slug='p-6-sipro-end-term-3' AND title=:'corrected' AND short_description=:'summary'
 AND subject_id=(SELECT id FROM subjects WHERE slug='science')
 AND academic_year_id=(SELECT id FROM academic_years WHERE year=2022)
\else
UPDATE resources SET title=:'corrected', subject_id=(SELECT id FROM subjects WHERE slug='science'),
 academic_year_id=(SELECT id FROM academic_years WHERE year=2022), short_description=:'summary', updated_at=now()
WHERE slug='p-6-sipro-end-term-3' AND title=:'original' AND short_description IS NULL AND subject_id IS NULL
 AND academic_year_id=(SELECT id FROM academic_years WHERE year=2024)
\endif
 AND EXISTS (SELECT 1 FROM subjects WHERE slug='science')
 AND EXISTS (SELECT 1 FROM academic_years WHERE year=2022)
 AND status='published' AND file_id IN (SELECT id FROM resource_files WHERE sha256='ec87fd7fefd70c607e9f7293376af72ac64d7e279d0c8e1581ac5c1504220819');
SELECT 1 / ((:ROW_COUNT = 1)::int) AS exactly_one_row;
\if :dry_run
ROLLBACK;
\else
COMMIT;
\endif
