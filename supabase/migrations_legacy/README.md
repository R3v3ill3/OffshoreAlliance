# Legacy migration archive

These 246 SQL files are the immutable pre-baseline migration record. They were
retired on 2026-09-08 because historical filename versions no longer matched
the independently generated DEV and PROD migration ledgers.

Do not move these files back into `supabase/migrations`, rename them, or apply
them to a database. Current environments and fresh databases use the canonical
baseline beginning at `20260908050000`.

The archive is retained only for audit and recovery. Normal schema changes must
be added as one new, uniquely versioned file in `supabase/migrations` and
promoted unchanged from DEV to PROD.
