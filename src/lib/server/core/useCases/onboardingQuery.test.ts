import { describe, it, expect, vi } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import { fetchOnboardingBootstrap } from './onboardingQuery';

const ORG = 'test-org';

function makeOnboardingRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 'ob1',
		organization_id: ORG,
		personnel_id: 'p1',
		started_at: '2026-01-01',
		completed_at: null,
		cancelled_at: null,
		status: 'in_progress',
		template_id: null,
		onboarding_step_progress: [],
		...overrides
	};
}

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
		const ctx = createWritePortsContext({ auth: { orgId: ORG } });
		ctx.store.seed('personnel_onboardings', [
			makeOnboardingRow({ id: 'ob1', personnel_id: 'p1', status: 'in_progress' }),
			makeOnboardingRow({
				id: 'ob2',
				personnel_id: 'p2',
				status: 'completed',
				completed_at: '2026-01-02'
			}),
			makeOnboardingRow({ id: 'ob3', personnel_id: 'p3', status: 'cancelled', cancelled_at: '2026-01-03' })
		]);

		const result = await fetchOnboardingBootstrap(ctx);

		expect(result.onboardings).toHaveLength(3);
		expect(result.onboardings.map((onboarding) => onboarding.status).sort()).toEqual([
			'cancelled',
			'completed',
			'in_progress'
		]);
	});

	it('returns only in-progress onboardings and passes a status filter in active mode', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG } });
		const findManySpy = vi.spyOn(ctx.store, 'findMany');
		ctx.store.seed('personnel_onboardings', [
			makeOnboardingRow({ id: 'active-ob', personnel_id: 'p1', status: 'in_progress' }),
			makeOnboardingRow({
				id: 'completed-ob',
				personnel_id: 'p2',
				status: 'completed',
				completed_at: '2026-01-02'
			}),
			makeOnboardingRow({
				id: 'cancelled-ob',
				personnel_id: 'p3',
				status: 'cancelled',
				cancelled_at: '2026-01-03'
			})
		]);

		const result = await fetchOnboardingBootstrap(ctx, { mode: 'active' });

		expect(result.onboardings).toHaveLength(1);
		expect(result.onboardings[0]).toMatchObject({ id: 'active-ob', status: 'in_progress' });
		const onboardingCall = findManySpy.mock.calls.find(([table]) => table === 'personnel_onboardings');
		expect(onboardingCall?.[2]).toEqual({ status: 'in_progress' });
		expect(onboardingCall?.[3]).toMatchObject({ select: expect.any(String) });
		expect(onboardingCall?.[3]?.inFilters).toBeUndefined();
	});

	it('returns only completed and cancelled onboardings and passes an in-filter in history mode', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG } });
		const findManySpy = vi.spyOn(ctx.store, 'findMany');
		ctx.store.seed('personnel_onboardings', [
			makeOnboardingRow({ id: 'active-ob', personnel_id: 'p1', status: 'in_progress' }),
			makeOnboardingRow({
				id: 'completed-ob',
				personnel_id: 'p2',
				status: 'completed',
				completed_at: '2026-01-02'
			}),
			makeOnboardingRow({
				id: 'cancelled-ob',
				personnel_id: 'p3',
				status: 'cancelled',
				cancelled_at: '2026-01-03'
			})
		]);

		const result = await fetchOnboardingBootstrap(ctx, { mode: 'history' });

		expect(result.onboardings.map((onboarding) => onboarding.id).sort()).toEqual(['cancelled-ob', 'completed-ob']);
		const onboardingCall = findManySpy.mock.calls.find(([table]) => table === 'personnel_onboardings');
		expect(onboardingCall?.[2]).toBeUndefined();
		expect(onboardingCall?.[3]).toMatchObject({
			select: expect.any(String),
			inFilters: { status: ['completed', 'cancelled'] }
		});
	});

	it('keeps archived subjects and their completed workflows in scoped Onboarding history', async () => {
		const ctx = createWritePortsContext({
			auth: {
				orgId: ORG,
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['g1'] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'view',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('groups', [
			{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
			{ id: 'g2', organization_id: ORG, name: 'Bravo', sort_order: 1 },
			{ id: 'foreign', organization_id: 'other-org', name: 'Foreign', sort_order: -1 }
		]);
		ctx.store.seed('personnel', [
			{
				id: 'archived-in-scope',
				organization_id: ORG,
				group_id: 'g1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				archived_at: '2026-08-01',
				groups: { name: 'Alpha' }
			},
			{
				id: 'archived-out-of-scope',
				organization_id: ORG,
				group_id: 'g2',
				rank: 'CPL',
				last_name: 'Jones',
				first_name: 'John',
				archived_at: '2026-08-01',
				groups: { name: 'Bravo' }
			}
		]);
		ctx.store.seed('personnel_onboardings', [
			makeOnboardingRow({ id: 'visible-history', personnel_id: 'archived-in-scope', status: 'completed' }),
			makeOnboardingRow({ id: 'hidden-history', personnel_id: 'archived-out-of-scope', status: 'completed' })
		]);

		const history = await fetchOnboardingBootstrap(ctx, { mode: 'history' });
		expect(history.groups.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
		expect(history.personnel).toMatchObject([
			{ id: 'archived-in-scope', archivedAt: '2026-08-01', groupName: 'Alpha' }
		]);
		expect(history.onboardings.map((onboarding) => onboarding.id)).toEqual(['visible-history']);
		await expect(fetchOnboardingBootstrap(ctx, { mode: 'active' })).resolves.toMatchObject({
			personnel: [],
			onboardings: []
		});
	});

	it('keeps archived workflows in default all mode while returning an active roster', async () => {
		const ctx = createWritePortsContext({
			auth: {
				orgId: ORG,
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['g1'] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'view',
					ratingScheme: 'none'
				}
			}
		});
		ctx.store.seed('personnel', [
			{ id: 'active', organization_id: ORG, group_id: 'g1', archived_at: null },
			{ id: 'archived', organization_id: ORG, group_id: 'g1', archived_at: '2026-08-01' },
			{ id: 'outside', organization_id: ORG, group_id: 'g2', archived_at: '2026-08-01' }
		]);
		ctx.store.seed('personnel_onboardings', [
			makeOnboardingRow({ id: 'current', personnel_id: 'active' }),
			makeOnboardingRow({ id: 'past', personnel_id: 'archived', status: 'completed' }),
			makeOnboardingRow({ id: 'hidden', personnel_id: 'outside', status: 'completed' })
		]);

		const result = await fetchOnboardingBootstrap(ctx);
		expect(result.personnel.map((person) => person.id)).toEqual(['active']);
		expect(result.onboardings.map((onboarding) => onboarding.id)).toEqual(['current', 'past']);
	});

	it('filters onboardings to scoped group personnel only', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG, scopeSet: { kind: 'groups', groupIds: ['g1'] } } });
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

	it('applies group-scoped personnel filtering after the active status query', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG, scopeSet: { kind: 'groups', groupIds: ['g1'] } } });
		const findManySpy = vi.spyOn(ctx.store, 'findMany');
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
			makeOnboardingRow({ id: 'in-scope-active', personnel_id: 'p1', status: 'in_progress' }),
			makeOnboardingRow({ id: 'out-of-scope-active', personnel_id: 'p2', status: 'in_progress' }),
			makeOnboardingRow({
				id: 'in-scope-history',
				personnel_id: 'p1',
				status: 'completed',
				completed_at: '2026-01-02'
			})
		]);

		const result = await fetchOnboardingBootstrap(ctx, { mode: 'active' });

		expect(result.onboardings).toHaveLength(1);
		expect(result.onboardings[0]).toMatchObject({ id: 'in-scope-active', personnelId: 'p1' });
		expect(result.personnel.map((p) => p.id)).toEqual(['p1']);
		const onboardingCall = findManySpy.mock.calls.find(([table]) => table === 'personnel_onboardings');
		expect(onboardingCall?.[2]).toEqual({ status: 'in_progress' });
	});

	it('refreshes training step completion for active in-progress onboardings', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG } });
		const trainingTypeId = 'tt1';
		ctx.store.seed('personnel', [{ id: 'p1', organization_id: ORG }]);
		ctx.store.seed('training_types', [{ id: trainingTypeId, organization_id: ORG, name: 'CPR' }]);

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
		// Training-backed hydration reads step progress directly.
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
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: ['g1'] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'view',
					ratingScheme: 'none'
				}
			}
		});
		const trainingTypeId = 'tt1';
		ctx.store.seed('personnel', [{ id: 'p1', organization_id: ORG, group_id: 'g1' }]);
		ctx.store.seed('training_types', [{ id: trainingTypeId, organization_id: ORG, name: 'CPR' }]);

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
		const userStoreFindMany = ctx.store.findMany.bind(ctx.store);
		vi.spyOn(ctx.store, 'findMany').mockImplementation(async (table, orgId, filters, options) => {
			if (table === 'training_types' || table === 'personnel_trainings' || table === 'personnel') {
				throw Object.assign(new Error('Training and Personnel SELECT denied by RLS'), { status: 403 });
			}
			return userStoreFindMany(table, orgId, filters, options);
		});

		const result = await fetchOnboardingBootstrap(ctx);

		expect(result.trainingTypes.map((type) => type.name)).toEqual(['CPR']);
		const step = result.onboardings[0].steps.find((s) => s.id === 'sp1');
		expect(step).toBeDefined();
		expect(step!.completed).toBe(true);

		const stored = await ctx.store.findOne<{ completed: boolean }>('onboarding_step_progress', ORG, { id: 'sp1' });
		expect(stored?.completed).toBe(false);
	});

	it('limits training completion hydration to active training-backed onboardings', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG } });
		ctx.store.seed('personnel', [
			{ id: 'p-active', organization_id: ORG },
			{ id: 'p-history', organization_id: ORG }
		]);
		ctx.store.seed('training_types', [
			{ id: 'tt-active', organization_id: ORG, name: 'CPR' },
			{ id: 'tt-history', organization_id: ORG, name: 'First Aid' }
		]);
		const activeStep = {
			id: 'sp-active',
			onboarding_id: 'ob-active',
			organization_id: ORG,
			step_name: 'CPR',
			step_type: 'training',
			training_type_id: 'tt-active',
			stages: null,
			sort_order: 0,
			completed: false,
			current_stage: null,
			notes: [],
			template_step_id: null,
			active: true
		};
		const historyStep = {
			id: 'sp-history',
			onboarding_id: 'ob-history',
			organization_id: ORG,
			step_name: 'First Aid',
			step_type: 'training',
			training_type_id: 'tt-history',
			stages: null,
			sort_order: 0,
			completed: false,
			current_stage: null,
			notes: [],
			template_step_id: null,
			active: true
		};

		ctx.store.seed('personnel_onboardings', [
			makeOnboardingRow({
				id: 'ob-active',
				personnel_id: 'p-active',
				status: 'in_progress',
				onboarding_step_progress: [activeStep]
			}),
			makeOnboardingRow({
				id: 'ob-history',
				personnel_id: 'p-history',
				status: 'completed',
				completed_at: '2026-01-02',
				onboarding_step_progress: [historyStep]
			})
		]);
		ctx.store.seed('personnel_trainings', [
			{
				id: 'pt-active',
				organization_id: ORG,
				personnel_id: 'p-active',
				training_type_id: 'tt-active',
				completed_date: '2026-01-01',
				expiration_date: null,
				exempted: false
			},
			{
				id: 'pt-history',
				organization_id: ORG,
				personnel_id: 'p-history',
				training_type_id: 'tt-history',
				completed_date: '2026-01-02',
				expiration_date: null,
				exempted: false
			}
		]);

		const result = await fetchOnboardingBootstrap(ctx);

		const activeResultStep = result.onboardings.find((onboarding) => onboarding.id === 'ob-active')?.steps[0];
		const historyResultStep = result.onboardings.find((onboarding) => onboarding.id === 'ob-history')?.steps[0];
		expect(activeResultStep?.completed).toBe(true);
		expect(historyResultStep?.completed).toBe(false);
	});

	it('hydrates multiple active training-backed onboardings independently', async () => {
		const ctx = createWritePortsContext({ auth: { orgId: ORG } });
		ctx.store.seed('personnel', [
			{ id: 'p1', organization_id: ORG },
			{ id: 'p2', organization_id: ORG }
		]);
		ctx.store.seed('training_types', [
			{ id: 'tt-cpr', organization_id: ORG, name: 'CPR' },
			{ id: 'tt-first-aid', organization_id: ORG, name: 'First Aid' }
		]);
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
						training_type_id: 'tt-cpr',
						stages: null,
						sort_order: 0,
						completed: false,
						current_stage: null,
						notes: [],
						template_step_id: null,
						active: true
					}
				]
			},
			{
				id: 'ob2',
				organization_id: ORG,
				personnel_id: 'p2',
				started_at: '2026-01-02',
				completed_at: null,
				cancelled_at: null,
				status: 'in_progress',
				template_id: null,
				onboarding_step_progress: [
					{
						id: 'sp2',
						onboarding_id: 'ob2',
						organization_id: ORG,
						step_name: 'First Aid',
						step_type: 'training',
						training_type_id: 'tt-first-aid',
						stages: null,
						sort_order: 0,
						completed: false,
						current_stage: null,
						notes: [],
						template_step_id: null,
						active: true
					},
					{
						id: 'sp3',
						onboarding_id: 'ob2',
						organization_id: ORG,
						step_name: 'Inactive CPR',
						step_type: 'training',
						training_type_id: 'tt-cpr',
						stages: null,
						sort_order: 1,
						completed: true,
						current_stage: null,
						notes: [],
						template_step_id: null,
						active: false
					}
				]
			}
		]);
		ctx.store.seed('personnel_trainings', [
			{
				id: 'pt1',
				organization_id: ORG,
				personnel_id: 'p1',
				training_type_id: 'tt-cpr',
				completed_date: '2026-01-01',
				expiration_date: null,
				exempted: false
			},
			{
				id: 'pt2',
				organization_id: ORG,
				personnel_id: 'p2',
				training_type_id: 'tt-first-aid',
				completed_date: '2026-01-02',
				expiration_date: null,
				exempted: false
			}
		]);

		const result = await fetchOnboardingBootstrap(ctx);

		const firstOnboardingStep = result.onboardings.find((onboarding) => onboarding.id === 'ob1')?.steps[0];
		const secondOnboarding = result.onboardings.find((onboarding) => onboarding.id === 'ob2');
		expect(firstOnboardingStep?.completed).toBe(true);
		expect(secondOnboarding?.steps.find((step) => step.id === 'sp2')?.completed).toBe(true);
		expect(secondOnboarding?.steps.find((step) => step.id === 'sp3')?.completed).toBe(true);
	});
});
