# Migration history notes

- **023 is intentionally absent.** `git log --all -- supabase/migrations/023*`
  is empty across every branch: the number was skipped during the 024
  `create_pending_order` work and is referenced by nothing. Do not renumber
  existing migrations to "fill" the gap.
- **030 → 031.** `030_user_reduce_motion.sql` was renamed to `031_…` because a
  duplicate `030` version existed (commit 59782b5). Environments that already
  applied either name keep their history row; `supabase migration list` is the
  per-environment source of truth.
- **032_orders_locale_fr.sql** widens `orders.locale` to `('en','ar','fr')`.
  Before it, French checkouts violated `orders_locale_check` and the whole
  order transaction rolled back.
- **034_gift_finder.sql** adds product gift-tag columns, `quiz_completions`,
  and the seed-catalog tag updates for the gift finder quiz. It was created as
  `033_…` and renamed because `033_multi_recipient_orders.sql` had already been
  committed.
