-- 00b · Supplementary counts (read-only). Added in DA0.1 (2026-09-22) for the plan §1.1 figures that
-- 00–07 did not cover, and for the table that exists only where 20260921030000_membership_updates is
-- applied (it is absent on the 12 September clone; the statement errors there and that is expected).
SELECT role_type, count(*) AS n FROM employer_worksite_roles GROUP BY 1 ORDER BY n DESC, role_type;

SELECT 'membership_update_batches' AS t, count(*) AS n FROM membership_update_batches;
