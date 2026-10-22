import { describe, expect, it, vi } from 'vitest';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { createTestContext } from '$features/onboarding/server/onboardingPersistence.test-support.server';
import { applyStarterConfigurationPack } from './starterConfigurationPacks.server';

const NO_ONBOARDING_CONFIGURE: CapabilityMap = {
	calendar: 'configure',
	personnel: 'none',
	training: 'configure',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const RACED_TRAINING_TYPE = '00000000-0000-4000-8000-000000000010';
const RACED_TEMPLATE = '00000000-0000-4000-8000-000000000011';

describe('starter configuration packs', () => {
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
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toEqual([]);
	});

	it('applies starter artifacts while preserving saved Calendar facts', async () => {
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

		const result = await applyStarterConfigurationPack(ctx, 'first-week-operations');

		expect(result.failed).toEqual([]);
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
				ctx.store.seed('training_types', [{ id: RACED_TRAINING_TYPE, organization_id: orgId, ...data }]);
				throw new Error('duplicate key value violates unique constraint "training_types_clinic_id_name_key"');
			}

			if (table === 'onboarding_templates' && data.name === 'New Arrival Packet' && onboardingRace) {
				onboardingRace = false;
				ctx.store.seed('onboarding_templates', [{ id: RACED_TEMPLATE, organization_id: orgId, ...data }]);
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
});
