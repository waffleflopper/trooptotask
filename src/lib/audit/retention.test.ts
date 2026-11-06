import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AUDIT_KINDS } from './catalog';
import { ORGANIZATION_AUDIT_EXCLUDED_ACTIONS } from './organizationAuditStore.server';

function shortRetentionActionsInDatabase(): string[] {
	const schema = readFileSync('supabase/current-schema.sql', 'utf8');
	const body = /CREATE FUNCTION audit_private\.short_retention_actions\(\)[\s\S]*?ARRAY\[([^\]]*)\]/.exec(schema)?.[1];
	if (!body) throw new Error('short_retention_actions is missing from supabase/current-schema.sql');
	return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe('Audit retention', () => {
	it('keeps for 90 days exactly the kinds the unit log hides', () => {
		expect(shortRetentionActionsInDatabase().toSorted()).toEqual([...ORGANIZATION_AUDIT_EXCLUDED_ACTIONS].toSorted());
	});

	it('never shortens the retention of a cataloged unit record kind', () => {
		for (const action of ORGANIZATION_AUDIT_EXCLUDED_ACTIONS)
			expect(Object.hasOwn(AUDIT_KINDS, action), action).toBe(false);
	});
});
