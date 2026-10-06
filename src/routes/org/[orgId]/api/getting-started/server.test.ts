import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadGettingStartedDismissed, setGettingStartedDismissed } from '$features/identity/index.server';
import { countOrganizationMembers } from '$features/organization/index.server';
import { createTestContext } from '$features/rating-scheme/server/ratingSchemePersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _createConfigs } from './+server';

vi.mock('$features/identity/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/identity/index.server')>()),
	loadGettingStartedDismissed: vi.fn(),
	setGettingStartedDismissed: vi.fn()
}));
vi.mock('$features/organization/index.server', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/organization/index.server')>()),
	countOrganizationMembers: vi.fn()
}));
const supabase = {} as SupabaseClient;
const { get: _getConfig, post: _postConfig, delete: _deleteConfig } = _createConfigs({ supabase });
beforeEach(() => {
	vi.mocked(countOrganizationMembers).mockReset().mockResolvedValue(2);
	vi.mocked(loadGettingStartedDismissed).mockReset().mockResolvedValue(false);
	vi.mocked(setGettingStartedDismissed).mockReset().mockResolvedValue();
});

afterEach(() => vi.restoreAllMocks());

describe('GET /api/getting-started', () => {
	it('starts personal progress while Dashboard support is still pending', async () => {
		let release!: (count: number) => void;
		let started!: () => void;
		const memberStarted = new Promise<void>((resolve) => {
			started = resolve;
		});
		vi.mocked(countOrganizationMembers).mockImplementation(() => {
			started();
			return new Promise<number>((resolve) => {
				release = resolve;
			});
		});
		const pending = handleUseCaseRequest(_getConfig, createTestContext(), undefined, () => createTestContext());
		await memberStarted;
		try {
			expect(loadGettingStartedDismissed).toHaveBeenCalled();
		} finally {
			release(2);
		}
		await expect(pending).resolves.toMatchObject({ orgMemberCount: 2, gettingStartedDismissed: false });
	});

	it('fails the complete GET when Organization support cannot be read', async () => {
		vi.mocked(countOrganizationMembers).mockRejectedValue(new Error('Membership count unavailable'));
		await expect(
			handleUseCaseRequest(_getConfig, createTestContext(), undefined, () => createTestContext())
		).rejects.toThrow('Membership count unavailable');
	});
	it.each([
		['GET', (ctx: ReturnType<typeof createTestContext>) => handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx)],
		[
			'POST',
			(ctx: ReturnType<typeof createTestContext>) => handleUseCaseRequest(_postConfig, ctx, undefined, () => ctx)
		],
		[
			'DELETE',
			(ctx: ReturnType<typeof createTestContext>) => handleUseCaseRequest(_deleteConfig, ctx, undefined, () => ctx)
		]
	] as const)('%s rejects anonymous access before reading or writing support data', async (_method, request) => {
		const ctx = createTestContext({ auth: { userId: '' } });
		const reads = vi.spyOn(ctx.store, 'findManyWithCount');
		const preferences = vi.spyOn(ctx.store, 'findOne');
		await expect(request(ctx)).rejects.toMatchObject({
			status: 403,
			message: 'Unauthorized'
		});
		expect(reads).not.toHaveBeenCalled();
		expect(preferences).not.toHaveBeenCalled();
		expect(loadGettingStartedDismissed).not.toHaveBeenCalled();
		expect(countOrganizationMembers).not.toHaveBeenCalled();
		expect(setGettingStartedDismissed).not.toHaveBeenCalled();
	});

	it.each(['none', 'view'] as const)(
		'uses independent Rating %s access without Personnel lookup for its optional setup count',
		async (ratingScheme) => {
			const ctx = createTestContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'none',
						criticalTasks: 'none',
						onboarding: 'none',
						ratingScheme
					}
				}
			});
			ctx.rawStore.seed('rating_scheme_entries', [
				{ id: 'own', organization_id: ctx.auth.orgId, rated_person_id: 'person' },
				{ id: 'foreign', organization_id: 'other-org', rated_person_id: 'foreign-person' }
			]);
			const scopedStore = ctx.store;
			ctx.store = {
				...scopedStore,
				findManyWithCount: (table, ...args) => {
					if (table === 'rating_scheme_entries' || table === 'personnel')
						throw new Error('Generic Personnel-scoped Rating read unavailable');
					return scopedStore.findManyWithCount(table, ...args);
				}
			};
			await expect(handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx)).resolves.toMatchObject({
				ratingSchemeEntryCount: ratingScheme === 'view' ? 1 : 0
			});
		}
	);

	it('binds personal progress to the admitted account, Organization and ordinary request client', async () => {
		const ctx = createTestContext();
		await handleUseCaseRequest(_postConfig, ctx, undefined, () => ctx);
		expect(setGettingStartedDismissed).toHaveBeenLastCalledWith({ supabase, auth: ctx.auth, audit: ctx.audit }, true);
		await handleUseCaseRequest(_deleteConfig, ctx, undefined, () => ctx);
		expect(setGettingStartedDismissed).toHaveBeenLastCalledWith({ supabase, auth: ctx.auth, audit: ctx.audit }, false);
		await handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx);
		expect(loadGettingStartedDismissed).toHaveBeenLastCalledWith({ supabase }, ctx.auth);
		expect(countOrganizationMembers).toHaveBeenLastCalledWith(supabase, ctx.auth.orgId);
	});

	it('does not report dismissal success when its owner cannot confirm the save', async () => {
		vi.mocked(setGettingStartedDismissed).mockRejectedValue(new Error('Unable to confirm Getting Started save'));
		await expect(
			handleUseCaseRequest(_postConfig, createTestContext(), undefined, () => createTestContext())
		).rejects.toThrow('Unable to confirm');
	});

	it('returns retained scoped support with retired Duty storage unavailable', async () => {
		const ctx = createTestContext();
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		const findManyWithCount = ctx.store.findManyWithCount.bind(ctx.store);
		const retiredReads: string[] = [];
		vi.spyOn(ctx.store, 'findManyWithCount').mockImplementation((table, ...args) => {
			if (table.startsWith('duty_') || table.startsWith('advanced_duty_')) {
				retiredReads.push(table);
				throw new Error('Retired Duty storage is unavailable');
			}
			return findManyWithCount(table, ...args);
		});

		ctx.store.seed('training_types', [
			{
				id: 'training-1',
				organization_id: ctx.auth.orgId,
				name: 'Unit Orientation',
				description: null,
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#6b7280',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			},
			{ id: 'training-2', organization_id: ctx.auth.orgId, name: 'Bloodborne Pathogens' },
			{ id: 'foreign-training', organization_id: 'foreign-org', name: 'Foreign Training' }
		]);
		ctx.store.seed('onboarding_template_steps', [
			{ id: 'step-1', organization_id: ctx.auth.orgId, title: 'Step 1' },
			{ id: 'step-2', organization_id: ctx.auth.orgId, title: 'Step 2' },
			{ id: 'foreign-step', organization_id: 'foreign-org', title: 'Foreign' }
		]);
		ctx.store.seed('rating_scheme_entries', [
			{ id: 'rating-1', organization_id: ctx.auth.orgId, rated_person_id: 'p1', rating_period_end: '2026-01-01' }
		]);
		vi.mocked(loadGettingStartedDismissed).mockResolvedValue(true);

		const result = await handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx);

		expect(result).toEqual({
			trainingTypeCount: 2,
			onboardingTemplateStepCount: 2,
			ratingSchemeEntryCount: 1,
			orgMemberCount: 2,
			gettingStartedDismissed: true,
			starterConfigurationPacks: [
				expect.objectContaining({
					id: 'first-week-operations',
					name: 'First Week Operations',
					canApply: true,
					isFullyApplied: false,
					artifacts: expect.arrayContaining([
						expect.objectContaining({
							family: 'training-types',
							names: ['Unit Orientation', 'Required Annual Training']
						})
					])
				})
			]
		});
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[dashboard-load]',
			expect.objectContaining({
				orgId: ctx.auth.orgId,
				phase: 'support',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
		expect(retiredReads).toEqual([]);
	});

	it('allows a signed-in member to read their getting-started dashboard support data', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		await expect(handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx)).resolves.toMatchObject({
			gettingStartedDismissed: false,
			starterConfigurationPacks: [
				expect.objectContaining({
					canApply: false,
					deniedActions: expect.any(Array)
				})
			]
		});
	});
});
