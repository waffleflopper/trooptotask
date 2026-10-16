import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$features/calendar/calendarPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig, _postConfig, _putConfig, _deleteConfig } from './+server';

const SPECIAL_DAY_ID = '00000000-0000-4000-8000-000000000010';

describe('GET /api/special-days', () => {
	it('returns only saved days from the authorized Organization', async () => {
		const ctx = createTestContext();
		ctx.store.seed('special_days', [
			{ id: 'own-day', organization_id: 'test-org', date: '2026-09-28', name: 'Own closure', type: 'org-closure' },
			{
				id: 'foreign-day',
				organization_id: 'other-org',
				date: '2026-09-29',
				name: 'Foreign closure',
				type: 'org-closure'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx);

		expect(result).toEqual([expect.objectContaining({ id: 'own-day', name: 'Own closure' })]);
	});
});

describe('POST /api/special-days', () => {
	it('uses a policy-first route config for closure days and reset', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.calendar.configureSpecialDays);
		expect(_postConfig.policyResource).toEqual({ kind: 'organization' });
	});

	it('adds one closure per new date, skips taken dates, and audits each added day', async () => {
		const ctx = createTestContext();
		const taken = [
			{
				id: 'federal',
				organization_id: 'test-org',
				date: '2026-12-25',
				name: 'Christmas Day',
				type: 'federal-holiday'
			},
			{ id: 'closure', organization_id: 'test-org', date: '2026-12-28', name: 'Stand-down', type: 'org-closure' }
		];
		ctx.store.seed('special_days', taken);

		const result = (await handleUseCaseRequest(
			_postConfig,
			ctx,
			{ action: 'addClosureDays', name: ' Holiday leave ', dates: ['2026-12-28', '2026-12-24', '2026-12-25'] },
			() => ctx
		)) as { created: Array<{ id: string; date: string; name: string; type: string }> };

		expect(result.created).toEqual([
			expect.objectContaining({ date: '2026-12-24', name: 'Holiday leave', type: 'org-closure' })
		]);
		const stored = await ctx.store.findMany('special_days', 'test-org');
		expect(stored).toHaveLength(3);
		expect(stored).toEqual(expect.arrayContaining(taken));
		expect(ctx.audit.events).toEqual([
			expect.objectContaining({
				action: 'special_day.created',
				resourceType: 'special_day',
				resourceId: result.created[0].id
			})
		]);
	});

	it.each([
		['a blank name', { action: 'addClosureDays', name: '  ', dates: ['2026-12-24'] }],
		['no dates', { action: 'addClosureDays', name: 'Leave', dates: [] }],
		['a repeated date', { action: 'addClosureDays', name: 'Leave', dates: ['2026-12-24', '2026-12-24'] }],
		[
			'more than 366 dates',
			{
				action: 'addClosureDays',
				name: 'Leave',
				dates: Array.from({ length: 367 }, (_, day) => new Date(Date.UTC(2027, 0, day + 1)).toISOString().slice(0, 10))
			}
		],
		['a malformed date', { action: 'addClosureDays', name: 'Leave', dates: ['2026-12-32'] }],
		['no action', { name: 'Leave', date: '2026-12-24', type: 'org-closure' }]
	])('rejects %s with 400 and saves nothing', async (_label, input) => {
		const ctx = createTestContext();

		await expect(handleUseCaseRequest(_postConfig, ctx, input, () => ctx)).rejects.toMatchObject({ status: 400 });

		expect(await ctx.store.findMany('special_days', 'test-org')).toEqual([]);
		expect(ctx.audit.events).toEqual([]);
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
				id: SPECIAL_DAY_ID,
				organization_id: 'test-org',
				date: '2026-01-01',
				name: "New Year's Day",
				type: 'federal-holiday'
			}
		]);

		const result = await handleUseCaseRequest(
			_putConfig,
			ctx,
			{
				id: SPECIAL_DAY_ID,
				name: 'Staff Holiday',
				type: 'org-closure'
			},
			() => ctx
		);

		expect(result).toMatchObject({
			id: SPECIAL_DAY_ID,
			date: '2026-01-01',
			name: 'Staff Holiday',
			type: 'org-closure'
		});

		const stored = await ctx.store.findOne('special_days', 'test-org', { id: SPECIAL_DAY_ID });
		expect(stored).toMatchObject({
			id: SPECIAL_DAY_ID,
			date: '2026-01-01',
			name: 'Staff Holiday',
			type: 'org-closure'
		});
	});

	it('answers an update of a missing or foreign special day with 404 and changes neither', async () => {
		const ctx = createTestContext();
		const foreign = {
			id: SPECIAL_DAY_ID,
			organization_id: 'other-org',
			date: '2026-01-01',
			name: "New Year's Day",
			type: 'federal-holiday'
		};
		ctx.store.seed('special_days', [foreign]);

		for (const id of [SPECIAL_DAY_ID, '00000000-0000-4000-8000-000000000011']) {
			await expect(
				handleUseCaseRequest(_putConfig, ctx, { id, name: 'Staff Holiday' }, () => ctx)
			).rejects.toMatchObject({ status: 404, body: { message: 'That special day is no longer available.' } });
		}
		expect(await ctx.store.findMany('special_days', 'test-org')).toEqual([]);
		expect(await ctx.store.findMany('special_days', 'other-org')).toEqual([foreign]);
	});
});

describe('special-day configuration policy', () => {
	it('denies read, add, edit, delete, and reset to a Calendar operator without changing saved days', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: false,
				capabilityMap: {
					calendar: 'operate',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		const id = '11111111-1111-4111-8111-111111111111';
		const saved = { id, organization_id: 'test-org', date: '2026-09-28', name: 'Clinic day', type: 'org-closure' };
		ctx.store.seed('special_days', [saved]);

		for (const run of [
			() => handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx),
			() => handleUseCaseRequest(_putConfig, ctx, { id, name: 'Changed' }, () => ctx),
			() => handleUseCaseRequest(_deleteConfig, ctx, { id }, () => ctx),
			() => handleUseCaseRequest(_postConfig, ctx, { action: 'resetFederalHolidays' }, () => ctx),
			() =>
				handleUseCaseRequest(
					_postConfig,
					ctx,
					{ action: 'addClosureDays', name: 'Denied leave', dates: ['2026-12-24'] },
					() => ctx
				)
		]) {
			await expect(run()).rejects.toMatchObject({ status: 403 });
		}
		expect(await ctx.store.findMany('special_days', 'test-org')).toEqual([saved]);
	});
});
