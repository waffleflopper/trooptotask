import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig, _putConfig } from './+server';

describe('POST /api/special-days', () => {
	it('uses a policy-first route config for special-day creation and reset', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.configureSpecialDays);
		expect(_postConfig.policyResource).toEqual({ kind: 'organization' });
	});

	it('creates a special day through the mixed-action route config', async () => {
		const ctx = createTestContext();

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			date: '2026-02-13',
			name: 'Training Stand-down',
			type: 'org-closure'
		});

		expect(result).toMatchObject({
			date: '2026-02-13',
			name: 'Training Stand-down',
			type: 'org-closure'
		});

		const stored = await ctx.store.findMany('special_days', 'test-org', {
			type: 'org-closure'
		});
		expect(stored).toHaveLength(1);
	});
});

describe('PUT /api/special-days', () => {
	it('exports a calendar mutation route config', () => {
		expect('permission' in _putConfig).toBe(false);
		expect(_putConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.configureSpecialDays);
		expect(_putConfig.policyResource).toEqual({ kind: 'organization' });
		expect(_putConfig.mutation).toBe(true);
	});

	it('updates an existing special day', async () => {
		const ctx = createTestContext();
		ctx.store.seed('special_days', [
			{
				id: 'sd-1',
				organization_id: 'test-org',
				date: '2026-01-01',
				name: "New Year's Day",
				type: 'federal-holiday'
			}
		]);

		const result = await handleUseCaseRequest(_putConfig, ctx, {
			id: 'sd-1',
			name: 'Staff Holiday',
			type: 'org-closure'
		});

		expect(result).toMatchObject({
			id: 'sd-1',
			date: '2026-01-01',
			name: 'Staff Holiday',
			type: 'org-closure'
		});

		const stored = await ctx.store.findOne('special_days', 'test-org', { id: 'sd-1' });
		expect(stored).toMatchObject({
			id: 'sd-1',
			date: '2026-01-01',
			name: 'Staff Holiday',
			type: 'org-closure'
		});
	});
});
