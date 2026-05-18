import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPaths = [
	join(process.cwd(), 'supabase/migrations/20260518000100_account_setup_links.sql'),
	join(process.cwd(), 'supabase/migrations/20260518000200_access_request_setup_user_id.sql')
];
const sql = migrationPaths.map((migrationPath) => readFileSync(migrationPath, 'utf8')).join('\n');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Account Setup Links migration', () => {
	it('adds explicit setup completion tracking to Access Requests', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'alter table "public"."access_requests" add column if not exists "setup_completed_at" timestamp with time zone'
		);
		expect(normalized).toContain(
			'alter table "public"."access_requests" add column if not exists "setup_user_id" "uuid"'
		);
		expect(normalized).toContain(
			'create index if not exists "access_requests_setup_user_id_idx" on "public"."access_requests" using "btree" ("setup_user_id") where ("setup_user_id" is not null)'
		);
	});

	it('creates hashed-token setup-link storage with one active unused link per Access Request', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create table if not exists "public"."account_setup_links"');
		expect(normalized).toContain('"token_hash" "text" not null');
		expect(normalized).not.toContain('"token" "text"');
		expect(normalized).toContain(
			'create unique index if not exists "account_setup_links_one_active_per_request_idx" on "public"."account_setup_links" using "btree" ("access_request_id") where (("used_at" is null) and ("revoked_at" is null))'
		);
	});

	it('keeps cleanup and validation queries indexable without exposing raw token values', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'create unique index if not exists "account_setup_links_token_hash_key" on "public"."account_setup_links" using "btree" ("token_hash")'
		);
		expect(normalized).toContain(
			'create index if not exists "account_setup_links_cleanup_idx" on "public"."account_setup_links" using "btree" ("expires_at", "used_at", "revoked_at")'
		);
		expect(normalized).toContain(
			'alter table only "public"."account_setup_links" add constraint "account_setup_links_access_request_id_fkey" foreign key ("access_request_id") references "public"."access_requests"("id") on delete cascade'
		);
	});
});
