import { describe, expect, it, vi } from 'vitest';
import type { UseCaseContext } from '$lib/server/core/ports';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _getConfig, _postConfig } from './+server';

describe('GET /api/getting-started', () => {
	it.each([
		['GET', (ctx: UseCaseContext) => handleUseCaseRequest(_getConfig, ctx, undefined)],
		['POST', (ctx: UseCaseContext) => handleUseCaseRequest(_postConfig, ctx, undefined)],
		['DELETE', (ctx: UseCaseContext) => handleUseCaseRequest(_deleteConfig, ctx, undefined)]
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
	});

	it('dismisses and restores only the current user’s Organization preference', async () => {
		const ctx = createTestContext();
		const own = { id: 'own', organization_id: ctx.auth.orgId, user_id: ctx.auth.userId, dismissed_at: null };
		const other = { id: 'other', organization_id: ctx.auth.orgId, user_id: 'other-user', dismissed_at: null };
		const foreign = { id: 'foreign', organization_id: 'foreign-org', user_id: ctx.auth.userId, dismissed_at: null };
		ctx.store.seed('getting_started_progress', [own, other, foreign]);

		await handleUseCaseRequest(_postConfig, ctx, undefined);
		await expect(handleUseCaseRequest(_getConfig, ctx, undefined)).resolves.toMatchObject({
			gettingStartedDismissed: true
		});
		await expect(ctx.store.findOne('getting_started_progress', ctx.auth.orgId, { id: 'other' })).resolves.toEqual(
			other
		);
		await expect(ctx.store.findOne('getting_started_progress', 'foreign-org', { id: 'foreign' })).resolves.toEqual(
			foreign
		);

		await handleUseCaseRequest(_deleteConfig, ctx, undefined);
		await expect(ctx.store.findOne('getting_started_progress', ctx.auth.orgId, { id: 'own' })).resolves.toEqual(own);
		await expect(handleUseCaseRequest(_getConfig, ctx, undefined)).resolves.toMatchObject({
			gettingStartedDismissed: false
		});
	});

	it('returns retained scoped support', async () => {
		const ctx = createTestContext();
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

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
			}
		]);
		ctx.store.seed('onboarding_template_steps', [
			{ id: 'step-1', organization_id: ctx.auth.orgId, title: 'Step 1' },
			{ id: 'step-2', organization_id: ctx.auth.orgId, title: 'Step 2' },
			{ id: 'foreign-step', organization_id: 'foreign-org', title: 'Foreign' }
		]);
		ctx.store.seed('rating_scheme_entries', [
			{ id: 'rating-1', organization_id: ctx.auth.orgId, rated_person_id: 'p1', rating_period_end: '2026-01-01' }
		]);
		ctx.store.seed('organization_memberships', [
			{ id: 'member-1', organization_id: ctx.auth.orgId, user_id: ctx.auth.userId, role: 'owner' },
			{ id: 'member-2', organization_id: ctx.auth.orgId, user_id: 'user-2', role: 'member' }
		]);
		ctx.store.seed('getting_started_progress', [
			{
				id: 'progress-1',
				organization_id: ctx.auth.orgId,
				user_id: ctx.auth.userId,
				dismissed_at: '2026-04-10T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, undefined);

		expect(result).toEqual({
			trainingTypeCount: 1,
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

		await expect(handleUseCaseRequest(_getConfig, ctx, undefined)).resolves.toMatchObject({
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
