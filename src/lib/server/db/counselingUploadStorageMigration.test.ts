import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260515000800_counseling_files_bucket.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('counseling upload storage migration', () => {
	it('creates the private counseling files bucket required by local uploads', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('insert into "storage"."buckets"');
		expect(normalized).toContain("'counseling-files'");
		expect(normalized).toContain('"public" = false');
		expect(normalized).toContain('"file_size_limit" = excluded."file_size_limit"');
		expect(normalized).toContain("'application/pdf'");
	});
});
