import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _postConfig } from './+server';

describe('/api/daily-assignments/batch route config', () => {
	it('uses a policy-first config for batch assignment mutations', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.manageAssignments);
		expect(_postConfig.policyResource).toEqual({ kind: 'unscoped' });
		expect(_postConfig.mutation).toBe(true);
	});

	it('accepts batch records that clear a slot with an empty assignee id', () => {
		const result = _postConfig.input.safeParse({
			records: [{ date: '2026-03-20', assignmentTypeId: 't1', assigneeId: '' }]
		});

		expect(result.success).toBe(true);
	});

	it('rejects non-array batch records', () => {
		const result = _postConfig.input.safeParse({ records: 'nope' });

		expect(result.success).toBe(false);
	});

	it('strips unknown assignment lineage fields from parsed records', () => {
		const result = _postConfig.input.safeParse({
			records: [
				{
					date: '2026-03-20',
					assignmentTypeId: 't1',
					assigneeId: 'p1',
					dutyRosterTemplateRunId: 'smuggled'
				}
			]
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error('expected valid batch payload');
		expect(result.data.records[0]).not.toHaveProperty('dutyRosterTemplateRunId');
	});
});
