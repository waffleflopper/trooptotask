import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const storageMigration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260524000400_organization_checkout_attempts.sql'),
	'utf8'
);

const ownerPolicyMigration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260524000500_organization_checkout_attempts_owner_policy.sql'),
	'utf8'
);

const ownerSelectPolicyMigration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260524000600_organization_checkout_attempts_owner_select_policy.sql'),
	'utf8'
);

function normalizedStorageSql() {
	return storageMigration.replace(/\s+/g, ' ').toLowerCase();
}

function normalizedOwnerPolicySql() {
	return ownerPolicyMigration.replace(/\s+/g, ' ').toLowerCase();
}

function normalizedOwnerSelectPolicySql() {
	return ownerSelectPolicyMigration.replace(/\s+/g, ' ').toLowerCase();
}

describe('organization checkout attempts migration', () => {
	it('creates organization-scoped checkout attempt storage', () => {
		const normalized = normalizedStorageSql();

		expect(normalized).toContain('create table if not exists "public"."organization_checkout_attempts"');
		expect(normalized).toContain('"organization_id" uuid not null');
		expect(normalized).toContain('"stripe_checkout_session_id" text');
		expect(normalized).toContain('"stripe_customer_id" text');
		expect(normalized).toContain('"commercial_plan" text not null');
		expect(normalized).toContain('"stripe_price_id" text not null');
		expect(normalized).toContain('"checkout_url" text');
		expect(normalized).toContain('"status" text not null default \'in_progress\'::text');
	});

	it('keeps only one in-progress checkout attempt per organization', () => {
		const normalized = normalizedStorageSql();

		expect(normalized).toContain('create unique index if not exists "organization_checkout_attempts_active_org_key"');
		expect(normalized).toContain('using "btree" ("organization_id") where "status" = \'in_progress\'::text');
		expect(normalized).toContain('create unique index if not exists "organization_checkout_attempts_session_key"');
	});

	it('constrains plan and lifecycle status values', () => {
		const normalized = normalizedStorageSql();

		expect(normalized).toContain("'team'::text");
		expect(normalized).toContain("'unit'::text");
		expect(normalized).toContain("'in_progress'::text");
		expect(normalized).toContain("'completed'::text");
		expect(normalized).toContain("'canceled'::text");
		expect(normalized).toContain("'expired'::text");
		expect(normalized).toContain("'failed'::text");
	});

	it('allows owners to read attempts and service role to manage them', () => {
		const normalized = normalizedStorageSql();

		expect(normalized).toContain('grant select on table "public"."organization_checkout_attempts" to "authenticated"');
		expect(normalized).toContain('grant all on table "public"."organization_checkout_attempts" to "service_role"');
		expect(normalized).toContain('using ("public"."is_org_owner"("organization_id"))');
		expect(normalized).not.toContain('using ("public"."is_org_member"("organization_id"))');
		expect(normalized).toContain('using (("auth"."role"() = \'service_role\'::text))');
	});

	it('allows organization owners to create and update checkout attempts', () => {
		const normalized = normalizedOwnerPolicySql();

		expect(normalized).toContain('for insert with check ("public"."is_org_owner"("organization_id"))');
		expect(normalized).toContain('for update using ("public"."is_org_owner"("organization_id"))');
		expect(normalized).toContain('with check ("public"."is_org_owner"("organization_id"))');
		expect(normalized).toContain(
			'grant insert, update on table "public"."organization_checkout_attempts" to "authenticated"'
		);
	});

	it('replaces earlier member read policy with owner-only read policy', () => {
		const normalized = normalizedOwnerSelectPolicySql();

		expect(normalized).toContain('drop policy if exists "members can view organization checkout attempts"');
		expect(normalized).toContain('create policy "owners can view organization checkout attempts"');
		expect(normalized).toContain('for select using ("public"."is_org_owner"("organization_id"))');
		expect(normalized).not.toContain('is_org_member');
	});
});
