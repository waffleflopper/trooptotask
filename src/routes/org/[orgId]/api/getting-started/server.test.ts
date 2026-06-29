import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _getConfig, _postConfig } from './+server';

describe('GET /api/getting-started', () => {
	it('uses policy-first route configs for dashboard support and own preference writes', () => {
		expect('permission' in _getConfig).toBe(false);
		expect('permission' in _postConfig).toBe(false);
		expect('permission' in _deleteConfig).toBe(false);
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.identity.viewDashboard);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.identity.updateOwnPreferences);
		expect(_deleteConfig.policyAction).toBe(POLICY_ACTION_CATALOG.identity.updateOwnPreferences);
		expect(_postConfig.readOnlyModeException).toBe('identity-owned-preference');
		expect(_deleteConfig.readOnlyModeException).toBe('identity-owned-preference');
	});

	it('returns workspace support metadata and logs timing', async () => {
		const ctx = createTestContext();
		const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
		const findManyWithCountSpy = vi.spyOn(ctx.store, 'findManyWithCount');

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
			{ id: 'step-2', organization_id: ctx.auth.orgId, title: 'Step 2' }
		]);
		ctx.store.seed('rating_scheme_entries', [
			{ id: 'rating-1', organization_id: ctx.auth.orgId, rated_person_id: 'p1', rating_period_end: '2026-01-01' }
		]);
		ctx.store.seed('organization_memberships', [
			{ id: 'member-1', organization_id: ctx.auth.orgId, user_id: ctx.auth.userId, role: 'owner' },
			{ id: 'member-2', organization_id: ctx.auth.orgId, user_id: 'user-2', role: 'member' }
		]);
		ctx.store.seed('duty_roster_templates', [
			{ id: 'template-1', organization_id: ctx.auth.orgId, status: 'active' },
			{ id: 'template-archived', organization_id: ctx.auth.orgId, status: 'archived' }
		]);
		ctx.store.seed('duty_roster_template_runs', [{ id: 'run-1', organization_id: ctx.auth.orgId }]);
		ctx.store.seed('duty_roster_history', [{ id: 'history-1', organization_id: ctx.auth.orgId }]);
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
			dutyRosterTemplateCount: 2,
			dutyRosterRunCount: 1,
			dutyRosterHistoryCount: 1,
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
		expect(findManyWithCountSpy).toHaveBeenCalledWith(
			'training_types',
			ctx.auth.orgId,
			undefined,
			expect.objectContaining({
				select: 'id',
				range: { from: 0, to: 0 },
				count: 'estimated'
			})
		);
		expect(consoleInfoSpy).toHaveBeenCalledWith(
			'[dashboard-load]',
			expect.objectContaining({
				orgId: ctx.auth.orgId,
				phase: 'support',
				status: 'ok',
				durationMs: expect.any(Number)
			})
		);
		expect(findManyWithCountSpy).toHaveBeenCalledWith(
			'duty_roster_template_runs',
			ctx.auth.orgId,
			undefined,
			expect.objectContaining({
				select: 'id',
				range: { from: 0, to: 0 },
				count: 'estimated'
			})
		);
		expect(findManyWithCountSpy).toHaveBeenCalledWith(
			'duty_roster_templates',
			ctx.auth.orgId,
			undefined,
			expect.objectContaining({
				select: 'id',
				range: { from: 0, to: 0 },
				count: 'estimated'
			})
		);
		expect(findManyWithCountSpy).toHaveBeenCalledWith(
			'duty_roster_history',
			ctx.auth.orgId,
			undefined,
			expect.objectContaining({
				select: 'id',
				range: { from: 0, to: 0 },
				count: 'estimated'
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
