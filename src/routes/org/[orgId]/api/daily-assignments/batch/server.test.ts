import { describe, expect, it } from 'vitest';
import { _postConfig } from './+server';

describe('/api/daily-assignments/batch route config', () => {
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
});
