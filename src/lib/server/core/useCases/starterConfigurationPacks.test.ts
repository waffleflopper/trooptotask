import { describe, expect, it, vi } from 'vitest';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { applyStarterConfigurationPack, listStarterConfigurationPacks } from './starterConfigurationPacks';

const NO_TRAINING_CONFIGURE: CapabilityMap = {
	calendar: 'configure',
	personnel: 'none',
	training: 'operate',
	criticalTasks: 'none',
	onboarding: 'configure',
	ratingScheme: 'none'
};

const NO_ONBOARDING_CONFIGURE: CapabilityMap = {
	calendar: 'configure',
	personnel: 'none',
	training: 'configure',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('starter configuration packs', () => {
	it('returns the preview and empty-organization readiness', async () => {
		const ctx = createTestContext();

		const [pack] = await listStarterConfigurationPacks(ctx);

		expect(pack).toMatchObject({
			id: 'first-week-operations',
			name: 'First Week Operations',
			canApply: true,
			isFullyApplied: false
		});
		expect(pack.artifacts.map((artifact) => [artifact.family, artifact.names])).toEqual([
			['training-types', ['Unit Orientation', 'Required Annual Training']],
			[
				'onboarding-template',
				[
					'New Arrival Packet',
					'Confirm contact and roster details',
					'Complete unit orientation',
					'Review required documents',
					'Assign duty role and Group'
				]
			]
		]);
		expect(pack.readiness.map((family) => [family.family, family.configured, family.starterArtifactCount])).toEqual([
			['training-types', false, 0],
			['onboarding-template', false, 0]
		]);
	});

	it('reports configured families separately from full starter-pack application', async () => {
		const ctx = createTestContext();
		ctx.store.seed('training_types', [
			{
				id: 'training-custom',
				organization_id: ctx.auth.orgId,
				name: 'Local Range Safety',
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

		const [pack] = await listStarterConfigurationPacks(ctx);

		expect(pack.readiness.find((family) => family.family === 'training-types')).toMatchObject({
			configured: true,
			starterArtifactCount: 0
		});
		expect(pack.isFullyApplied).toBe(false);
	});

	it('does not count starter-named onboarding steps from unrelated templates as starter readiness', async () => {
		const ctx = createTestContext();
		ctx.store.seed('onboarding_templates', [
			{
				id: 'template-custom',
				organization_id: ctx.auth.orgId,
				name: 'Reception',
				description: null
			}
		]);
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'step-custom-1',
				organization_id: ctx.auth.orgId,
				template_id: 'template-custom',
				name: 'Confirm contact and roster details',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0
			},
			{
				id: 'step-custom-2',
				organization_id: ctx.auth.orgId,
				template_id: 'template-custom',
				name: 'Complete unit orientation',
				description: null,
				step_type: 'training',
				training_type_id: 'training-custom',
				stages: null,
				sort_order: 1
			}
		]);

		const [pack] = await listStarterConfigurationPacks(ctx);
		const onboardingReadiness = pack.readiness.find((family) => family.family === 'onboarding-template');

		expect(onboardingReadiness).toMatchObject({
			configured: true,
			starterArtifactCount: 0,
			existingStarterArtifactNames: []
		});
		expect(pack.isFullyApplied).toBe(false);
	});

	it('counts unique onboarding starter step names for readiness when duplicate rows exist', async () => {
		const ctx = createTestContext();
		ctx.store.seed('onboarding_templates', [
			{
				id: 'template-starter',
				organization_id: ctx.auth.orgId,
				name: 'New Arrival Packet',
				description: null
			}
		]);
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'step-duplicate-1',
				organization_id: ctx.auth.orgId,
				template_id: 'template-starter',
				name: 'Confirm contact and roster details',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0
			},
			{
				id: 'step-duplicate-2',
				organization_id: ctx.auth.orgId,
				template_id: 'template-starter',
				name: 'Confirm contact and roster details',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 1
			},
			{
				id: 'step-duplicate-3',
				organization_id: ctx.auth.orgId,
				template_id: 'template-starter',
				name: 'Confirm contact and roster details',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 2
			},
			{
				id: 'step-duplicate-4',
				organization_id: ctx.auth.orgId,
				template_id: 'template-starter',
				name: 'Confirm contact and roster details',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 3
			}
		]);

		const [pack] = await listStarterConfigurationPacks(ctx);
		const onboardingReadiness = pack.readiness.find((family) => family.family === 'onboarding-template');

		expect(onboardingReadiness).toMatchObject({
			configured: true,
			starterArtifactCount: 2,
			expectedArtifactCount: 5,
			existingStarterArtifactNames: ['New Arrival Packet', 'Confirm contact and roster details']
		});
		expect(pack.isFullyApplied).toBe(false);
	});

	it('builds readiness from targeted lookup rows without requiring unrelated full-table reads', async () => {
		const ctx = createTestContext();
		ctx.store.seed('training_types', [
			{
				id: 'training-custom',
				organization_id: ctx.auth.orgId,
				name: 'Local Range Safety',
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
		ctx.store.seed('onboarding_templates', [
			{
				id: 'template-custom',
				organization_id: ctx.auth.orgId,
				name: 'Reception',
				description: null
			}
		]);
		ctx.store.seed('onboarding_template_steps', [
			{
				id: 'step-custom',
				organization_id: ctx.auth.orgId,
				template_id: 'template-custom',
				name: 'Confirm contact and roster details',
				description: null,
				step_type: 'checkbox',
				training_type_id: null,
				stages: null,
				sort_order: 0
			}
		]);
		const originalFindMany = ctx.store.findMany.bind(ctx.store);
		const guardedTables = new Set(['training_types', 'onboarding_templates', 'onboarding_template_steps']);
		vi.spyOn(ctx.store, 'findMany').mockImplementation(async (table, orgId, filters, options) => {
			const hasFilters = filters !== undefined && Object.keys(filters).length > 0;
			const hasInFilters = options?.inFilters !== undefined && Object.keys(options.inFilters).length > 0;
			const isLimitCheck = options?.limit === 1;
			if (guardedTables.has(table) && !hasFilters && !hasInFilters && !isLimitCheck) {
				throw new Error(`unexpected full-table read: ${table}`);
			}
			return originalFindMany(table, orgId, filters, options);
		});

		const [pack] = await listStarterConfigurationPacks(ctx);

		expect(pack.readiness.map((family) => [family.family, family.configured, family.starterArtifactCount])).toEqual([
			['training-types', true, 0],
			['onboarding-template', true, 0]
		]);
		expect(pack.isFullyApplied).toBe(false);
	});

	it('applies starter artifacts for an empty Organization', async () => {
		const ctx = createTestContext();

		const result = await applyStarterConfigurationPack(ctx, 'first-week-operations');

		expect(result.failed).toEqual([]);
		expect(result.created.map((item) => item.name)).toEqual([
			'Unit Orientation',
			'Required Annual Training',
			'New Arrival Packet',
			'Confirm contact and roster details',
			'Complete unit orientation',
			'Review required documents',
			'Assign duty role and Group'
		]);
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toHaveLength(2);
		expect(await ctx.store.findMany('onboarding_templates', ctx.auth.orgId)).toHaveLength(1);
		expect(await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId)).toHaveLength(4);
		expect(await ctx.store.findMany('duty_roster_templates', ctx.auth.orgId)).toEqual([]);
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toEqual([]);

		const [pack] = await listStarterConfigurationPacks(ctx);
		expect(pack.isFullyApplied).toBe(true);
	});

	it('applies and reports readiness without Duty Roster storage while preserving Calendar facts', async () => {
		const ctx = createTestContext();
		const calendarType = {
			id: 'historical-duty-type',
			organization_id: ctx.auth.orgId,
			name: 'Staff Duty',
			archived_at: null,
			color: '#123456'
		};
		const calendarAssignment = {
			id: 'historical-assignment',
			organization_id: ctx.auth.orgId,
			assignment_type_id: calendarType.id,
			date: '2026-09-21',
			assignee_id: 'person-1'
		};
		ctx.store.seed('assignment_types', [calendarType]);
		ctx.store.seed('daily_assignments', [calendarAssignment]);
		const findMany = ctx.store.findMany.bind(ctx.store);
		const findOne = ctx.store.findOne.bind(ctx.store);
		vi.spyOn(ctx.store, 'findMany').mockImplementation((table, ...args) => {
			if (table.startsWith('duty_')) throw new Error('Duty Roster storage unavailable');
			return findMany(table, ...args);
		});
		vi.spyOn(ctx.store, 'findOne').mockImplementation((table, ...args) => {
			if (table.startsWith('duty_')) throw new Error('Duty Roster storage unavailable');
			return findOne(table, ...args);
		});

		expect((await listStarterConfigurationPacks(ctx))[0].isFullyApplied).toBe(false);
		const result = await applyStarterConfigurationPack(ctx, 'first-week-operations');

		expect(result.failed).toEqual([]);
		expect((await listStarterConfigurationPacks(ctx))[0].isFullyApplied).toBe(true);
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toEqual([calendarType]);
		expect(await ctx.store.findMany('daily_assignments', ctx.auth.orgId)).toEqual([calendarAssignment]);
	});

	it('skips existing starter artifacts when applied twice', async () => {
		const ctx = createTestContext();

		await applyStarterConfigurationPack(ctx, 'first-week-operations');
		const secondResult = await applyStarterConfigurationPack(ctx, 'first-week-operations');

		expect(secondResult.created).toEqual([]);
		expect(secondResult.failed).toEqual([]);
		expect(secondResult.skipped.map((item) => item.name)).toEqual([
			'Unit Orientation',
			'Required Annual Training',
			'New Arrival Packet',
			'Confirm contact and roster details',
			'Complete unit orientation',
			'Review required documents',
			'Assign duty role and Group'
		]);
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toHaveLength(2);
		expect(await ctx.store.findMany('onboarding_templates', ctx.auth.orgId)).toHaveLength(1);
		expect(await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId)).toHaveLength(4);
		expect(await ctx.store.findMany('duty_roster_templates', ctx.auth.orgId)).toEqual([]);
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toEqual([]);
	});

	it('treats raced unique starter artifacts as skipped when they can be re-read', async () => {
		const ctx = createTestContext();
		const originalInsert = ctx.store.insert.bind(ctx.store);
		let trainingRace = true;
		let onboardingRace = true;
		let onboardingStepRace = true;
		let racedStarterStepId: string | null = null;

		vi.spyOn(ctx.store, 'insert').mockImplementation(async (table, orgId, data, select) => {
			if (table === 'training_types' && data.name === 'Unit Orientation' && trainingRace) {
				trainingRace = false;
				ctx.store.seed('training_types', [{ id: 'training-raced', organization_id: orgId, ...data }]);
				throw new Error('duplicate key value violates unique constraint "training_types_clinic_id_name_key"');
			}

			if (table === 'onboarding_templates' && data.name === 'New Arrival Packet' && onboardingRace) {
				onboardingRace = false;
				ctx.store.seed('onboarding_templates', [{ id: 'template-raced', organization_id: orgId, ...data }]);
				throw new Error('duplicate key value violates unique constraint "onboarding_templates_org_name_unique"');
			}

			if (
				table === 'onboarding_template_steps' &&
				data.name === 'Confirm contact and roster details' &&
				onboardingStepRace
			) {
				onboardingStepRace = false;
				racedStarterStepId = String(data.id);
				expect(racedStarterStepId).toMatch(UUID_PATTERN);
				ctx.store.seed('onboarding_template_steps', [{ organization_id: orgId, ...data }]);
				throw new Error('duplicate key value violates unique constraint "onboarding_template_steps_pkey"');
			}

			return originalInsert(table, orgId, data, select);
		});

		const result = await applyStarterConfigurationPack(ctx, 'first-week-operations');

		expect(result.failed).toEqual([]);
		expect(result.skipped).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ family: 'training-types', name: 'Unit Orientation' }),
				expect.objectContaining({ family: 'onboarding-template', name: 'New Arrival Packet' }),
				expect.objectContaining({ family: 'onboarding-template', name: 'Confirm contact and roster details' })
			])
		);
		expect(result.created.map((item) => item.name)).toEqual([
			'Required Annual Training',
			'Complete unit orientation',
			'Review required documents',
			'Assign duty role and Group'
		]);
		const racedStep = await ctx.store.findOne<Record<string, unknown>>('onboarding_template_steps', ctx.auth.orgId, {
			name: 'Confirm contact and roster details'
		});
		expect(racedStep?.id).toBe(racedStarterStepId);
	});

	it('stops before writes when any required configure permission is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_ONBOARDING_CONFIGURE
			}
		});
		const insertSpy = vi.spyOn(ctx.store, 'insert');

		await expect(applyStarterConfigurationPack(ctx, 'first-week-operations')).rejects.toMatchObject({ status: 403 });

		expect(insertSpy).not.toHaveBeenCalled();
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toHaveLength(0);
	});

	it('reports support-safe failed artifact details without provider messages', async () => {
		const ctx = createTestContext();
		const originalInsert = ctx.store.insert.bind(ctx.store);
		vi.spyOn(ctx.store, 'insert').mockImplementation(async (table, orgId, data, select) => {
			if (table === 'training_types' && data.name === 'Required Annual Training') {
				throw new Error('duplicate key value violates unique constraint training_types_name_key');
			}
			return originalInsert(table, orgId, data, select);
		});

		const result = await applyStarterConfigurationPack(ctx, 'first-week-operations');

		expect(result.failed).toContainEqual({
			family: 'training-types',
			name: 'Required Annual Training',
			message: 'This starter artifact could not be created. Existing configuration was left unchanged.'
		});
		expect(JSON.stringify(result)).not.toContain('duplicate key');
	});

	it('marks the pack unavailable when the actor lacks configure permissions', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_TRAINING_CONFIGURE
			}
		});

		const [pack] = await listStarterConfigurationPacks(ctx);

		expect(pack.canApply).toBe(false);
		expect(pack.deniedActions).toContainEqual(
			expect.objectContaining({
				id: 'training.configureRequirements',
				reasonCode: 'denied:missing-capability'
			})
		);
	});
});
