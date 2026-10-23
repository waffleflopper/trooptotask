import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _postConfig } from './+server';

describe('/api/ict-tasks/batch route config', () => {
	it('authorizes task imports as library configuration', () => {
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.criticalTasks.configureLibrary);
		expect(_postConfig.mutation).toBe(true);
	});

	it('accepts typed task records and refuses malformed MOS codes, months and empty batches', () => {
		const valid = _postConfig.input.safeParse({
			records: [{ taskCode: 'ICT-1', title: 'Operate radio', mos: ['68W'], expirationMonths: 12 }]
		});
		expect(valid.success).toBe(true);
		for (const records of [
			[{ taskCode: 'ICT-1', mos: ['68w!'] }],
			[{ taskCode: 'ICT-1', expirationMonths: 0 }],
			[{ taskCode: ' ' }],
			[]
		])
			expect(_postConfig.input.safeParse({ records }).success).toBe(false);
	});
});
