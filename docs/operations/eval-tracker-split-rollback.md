# Eval Tracker split rollback

[`20261113120000_rating_scheme_evaluation_split.sql`](../../supabase/migrations/20261113120000_rating_scheme_evaluation_split.sql) splits `rating_scheme_entries` into `rating_schemes` and `evaluations`. It leaves `rating_scheme_entries` behind, frozen. No client can read or write it, and a deleted Person, Organization or Evaluation still takes its frozen row with it.

[`20261113120000_rating_scheme_evaluation_split.down.sql`](../../supabase/rollback/20261113120000_rating_scheme_evaluation_split.down.sql) undoes the split. It rebuilds the entries from the schemes and Evaluations, so work entered after the deploy is kept. It then restores the schema exactly as it was before the split and removes the migration from the history. Its header lists each choice the single table forces, such as which entry stays listed. The Database contracts CI job runs it after a round trip of post-split work and checks the schema and the rebuilt rows.

Robert runs it. It is never applied as a migration.

## Before you start

1. Confirm a backup or point-in-time restore point that covers the moment you start.
2. Confirm the split is the database's newest migration. The script refuses any other database and changes nothing. If a later migration was applied, roll that back first.

## Roll back

1. In Vercel, promote the production deployment built before the split. Until step 2 commits, the Evals pages show a load error, because the old build calls functions the split removed.
2. Run the script as `postgres`, the owner of the objects it restores:

   ```sh
   psql "<production connection string as postgres>" -v ON_ERROR_STOP=1 \
     -f supabase/rollback/20261113120000_rating_scheme_evaluation_split.down.sql
   ```

   It runs in one transaction and locks the rating scheme tables while it works. On success it prints a notice with the number of entries it rebuilt, one for each Evaluation and one for each scheme whose current chain no Evaluation carries.

3. Open the Evals page of an Organization with rating scheme data and check the rating scheme and its entries.
4. Revert the split's PR on `main` before anything else deploys. Otherwise the next production deploy brings back an app that needs the split's tables.

If the script fails, the transaction changes nothing. The previous build keeps showing the load error until the script succeeds or you promote the split's deployment again.
