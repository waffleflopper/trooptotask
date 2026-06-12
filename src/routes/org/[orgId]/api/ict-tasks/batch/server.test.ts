import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _postConfig } from './+server';

describe('/api/ict-tasks/batch route config', () => {
	it('uses policy-first authorization for ICT task import mutations', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.criticalTasks.configureLibrary);
		expect(_postConfig.mutation).toBe(true);
	});

	it('accepts structurally valid ICT task import payloads', () => {
		const result = _postConfig.input.safeParse({
			mode: 'create-only',
			records: [{ rowNumber: 1, values: { taskCode: 'ICT-1', title: 'Operate radio' } }]
		});

		expect(result.success).toBe(true);
	});

	it('defaults missing records to an empty array', () => {
		const result = _postConfig.input.safeParse({ mode: 'upsert' });

		expect(result.success).toBe(true);
		if (!result.success) throw new Error('expected valid ICT task import payload');
		expect(result.data.records).toEqual([]);
	});

	it('rejects unsupported import modes', () => {
		const result = _postConfig.input.safeParse({ mode: 'replace', records: [] });

		expect(result.success).toBe(false);
	});
});
