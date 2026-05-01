import { describe, it, expect } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { fetchOnboardingBootstrap } from './onboardingQuery';

const ORG = 'test-org';

describe('fetchOnboardingBootstrap', () => {
	it('returns onboarding data plus explicit reference collections for the org', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG } });
		ctx.store.seed('onboarding_templates', [
			{
				id: 'tpl1',
				organization_id: ORG,
				name: 'Basic Onboarding',
				description: null,
				created_at: '2026-01-01T00:00:00Z'
			}
		]);
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'stp1',
				organization_id: ORG,
				template_id: 'tpl1',
				name: 'Medical Check',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0
			}
		]);
		ctx.store.seed('personnel_onboardings', [
			{
				id: 'ob1',
				organization_id: ORG,
				personnel_id: 'p1',
				started_at: '2026-01-01T00:00:00Z',
				completed_at: null,
				cancelled_at: null,
				status: 'completed',
				template_id: 'tpl1',
				onboarding_step_progress: []
			}
		]);
		ctx.store.seed('groups', [{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 }]);
		ctx.store.seed('personnel', [
			{
				id: 'p1',
				organization_id: ORG,
				group_id: 'g1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '11B',
				clinic_role: '',
				archived_at: null,
				groups: { name: 'Alpha' }
			}
		]);
		ctx.store.seed('training_types', [
			{
				id: 'tt1',
				organization_id: ORG,
				name: 'CPR',
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
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);

		const result = await fetchOnboardingBootstrap(ctx);

		expect(result.onboardingTemplates).toHaveLength(1);
		expect(result.onboardingTemplates[0]).toMatchObject({ id: 'tpl1', name: 'Basic Onboarding' });
		expect(result.onboardingTemplateSteps).toHaveLength(1);
		expect(result.onboardingTemplateSteps[0]).toMatchObject({
			id: 'stp1',
			name: 'Medical Check',
			stepType: 'checkbox',
			templateId: 'tpl1'
		});
		expect(result.onboardings).toHaveLength(1);
		expect(result.onboardings[0]).toMatchObject({ id: 'ob1', personnelId: 'p1', status: 'completed' });
		expect(result.personnel).toEqual([
			expect.objectContaining({ id: 'p1', groupName: 'Alpha', firstName: 'John', lastName: 'Smith' })
		]);
		expect(result.groups).toEqual([expect.objectContaining({ id: 'g1', name: 'Alpha' })]);
		expect(result.trainingTypes).toEqual([expect.objectContaining({ id: 'tt1', name: 'CPR' })]);
	});

	it('returns all onboardings for an unscoped member', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG, scopedGroupId: null } });
		ctx.store.seed('personnel_onboardings', [
			{
				id: 'ob1',
				organization_id: ORG,
				personnel_id: 'p1',
				started_at: '2026-01-01',
				completed_at: null,
				cancelled_at: null,
				status: 'completed',
				template_id: null,
				onboarding_step_progress: []
			},
			{
				id: 'ob2',
				organization_id: ORG,
				personnel_id: 'p2',
				started_at: '2026-01-01',
				completed_at: null,
				cancelled_at: null,
				status: 'completed',
				template_id: null,
				onboarding_step_progress: []
			}
		]);

		const result = await fetchOnboardingBootstrap(ctx);

		expect(result.onboardings).toHaveLength(2);
	});

	it('filters onboardings to scoped group personnel only', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG, scopedGroupId: 'g1' } });
		ctx.store.seed('personnel', [
			{
				id: 'p1',
				organization_id: ORG,
				group_id: 'g1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '11B',
				clinic_role: '',
				archived_at: null,
				groups: { name: 'Alpha' }
			},
			{
				id: 'p2',
				organization_id: ORG,
				group_id: 'g2',
				rank: 'CPL',
				last_name: 'Jones',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: '',
				archived_at: null,
				groups: { name: 'Bravo' }
			}
		]);
		ctx.store.seed('personnel_onboardings', [
			{
				id: 'ob1',
				organization_id: ORG,
				personnel_id: 'p1',
				started_at: '2026-01-01',
				completed_at: null,
				cancelled_at: null,
				status: 'completed',
				template_id: null,
				onboarding_step_progress: []
			},
			{
				id: 'ob2',
				organization_id: ORG,
				personnel_id: 'p2',
				started_at: '2026-01-01',
				completed_at: null,
				cancelled_at: null,
				status: 'completed',
				template_id: null,
				onboarding_step_progress: []
			}
		]);

		const result = await fetchOnboardingBootstrap(ctx);

		expect(result.onboardings).toHaveLength(1);
		expect(result.onboardings[0].personnelId).toBe('p1');
		expect(result.personnel.map((p) => p.id)).toEqual(['p1']);
	});

	it('refreshes training step completion for active in-progress onboardings', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG } });
		const trainingTypeId = 'tt1';

		ctx.store.seed('personnel_onboardings', [
			{
				id: 'ob1',
				organization_id: ORG,
				personnel_id: 'p1',
				started_at: '2026-01-01',
				completed_at: null,
				cancelled_at: null,
				status: 'in_progress',
				template_id: null,
				onboarding_step_progress: [
					{
						id: 'sp1',
						onboarding_id: 'ob1',
						organization_id: ORG,
						step_name: 'CPR',
						step_type: 'training',
						training_type_id: trainingTypeId,
						stages: null,
						sort_order: 0,
						completed: false,
						current_stage: null,
						notes: [],
						template_step_id: null,
						active: true
					}
				]
			}
		]);
		// refreshTrainingSteps queries onboarding_step_progress directly
		ctx.store.seed('onboarding_step_progress', [
			{
				id: 'sp1',
				organization_id: ORG,
				onboarding_id: 'ob1',
				step_name: 'CPR',
				step_type: 'training',
				training_type_id: trainingTypeId,
				completed: false,
				active: true
			}
		]);
		// Soldier has a completed training record for this type
		ctx.store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: trainingTypeId,
				completed_date: '2026-01-01',
				expiration_date: null,
				exempted: false
			}
		]);

		const result = await fetchOnboardingBootstrap(ctx);

		const step = result.onboardings[0].steps.find((s) => s.id === 'sp1');
		expect(step).toBeDefined();
		expect(step!.completed).toBe(true);
	});

	it('hydrates active training-backed onboardings for view-only onboarding users', async () => {
		const ctx = createWritePortsContext({
			auth: {
				orgId: ORG,
				requireEdit(area) {
					if (area === 'onboarding') {
						throw Object.assign(new Error('Forbidden'), { status: 403 });
					}
				}
			}
		});
		const trainingTypeId = 'tt1';

		ctx.store.seed('personnel_onboardings', [
			{
				id: 'ob1',
				organization_id: ORG,
				personnel_id: 'p1',
				started_at: '2026-01-01',
				completed_at: null,
				cancelled_at: null,
				status: 'in_progress',
				template_id: null,
				onboarding_step_progress: [
					{
						id: 'sp1',
						onboarding_id: 'ob1',
						organization_id: ORG,
						step_name: 'CPR',
						step_type: 'training',
						training_type_id: trainingTypeId,
						stages: null,
						sort_order: 0,
						completed: false,
						current_stage: null,
						notes: [],
						template_step_id: null,
						active: true
					}
				]
			}
		]);
		ctx.store.seed('onboarding_step_progress', [
			{
				id: 'sp1',
				organization_id: ORG,
				onboarding_id: 'ob1',
				step_name: 'CPR',
				step_type: 'training',
				training_type_id: trainingTypeId,
				completed: false,
				active: true
			}
		]);
		ctx.store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: trainingTypeId,
				completed_date: '2026-01-01',
				expiration_date: null,
				exempted: false
			}
		]);

		const result = await fetchOnboardingBootstrap(ctx);

		const step = result.onboardings[0].steps.find((s) => s.id === 'sp1');
		expect(step).toBeDefined();
		expect(step!.completed).toBe(true);

		const stored = await ctx.store.findOne<{ completed: boolean }>('onboarding_step_progress', ORG, { id: 'sp1' });
		expect(stored?.completed).toBe(false);
	});
});
