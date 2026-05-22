import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('auth email outbox migration', () => {
	it('creates durable setup delivery records without raw token or setup URL storage', () => {
		const sql = readFileSync(
			join(process.cwd(), 'supabase/migrations/20260522000200_auth_email_outbox.sql'),
			'utf8'
		).toLowerCase();

		expect(sql).toContain('create table if not exists "public"."auth_email_outbox"');
		expect(sql).toContain('"access_request_id" uuid not null');
		expect(sql).toContain('"setup_link_id" uuid not null');
		expect(sql).toContain('"recipient" text not null');
		expect(sql).toContain('"purpose" text not null');
		expect(sql).toContain('"status" text not null');
		expect(sql).toContain('"attempt_count" integer not null default 0');
		expect(sql).toContain('"last_error" text');
		expect(sql).toContain('"sent_at" timestamp with time zone');
		expect(sql).not.toContain('raw_token');
		expect(sql).not.toContain('setup_url');
		expect(sql).not.toContain('token_url');
	});
});
