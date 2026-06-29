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
			],
			['duty-roster-template', ['Staff Duty']]
		]);
		expect(pack.readiness.map((family) => [family.family, family.configured, family.starterArtifactCount])).toEqual([
			['training-types', false, 0],
			['onboarding-template', false, 0],
			['duty-roster-template', false, 0]
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
			'Assign duty role and Group',
			'Staff Duty'
		]);
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toHaveLength(2);
		expect(await ctx.store.findMany('onboarding_templates', ctx.auth.orgId)).toHaveLength(1);
		expect(await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId)).toHaveLength(4);
		expect(await ctx.store.findMany('duty_roster_templates', ctx.auth.orgId)).toHaveLength(1);
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toHaveLength(1);

		const [pack] = await listStarterConfigurationPacks(ctx);
		expect(pack.isFullyApplied).toBe(true);
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
			'Assign duty role and Group',
			'Staff Duty'
		]);
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toHaveLength(2);
		expect(await ctx.store.findMany('onboarding_templates', ctx.auth.orgId)).toHaveLength(1);
		expect(await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId)).toHaveLength(4);
		expect(await ctx.store.findMany('duty_roster_templates', ctx.auth.orgId)).toHaveLength(1);
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

	it('blocks read-only Organizations through the policy guard before writes', async () => {
		const ctx = createTestContext({ readOnly: true });
		const insertSpy = vi.spyOn(ctx.store, 'insert');

		await expect(applyStarterConfigurationPack(ctx, 'first-week-operations')).rejects.toMatchObject({
			status: 403,
			message: 'Organization is in read-only mode'
		});

		expect(insertSpy).not.toHaveBeenCalled();
	});

	it('reports support-safe failed artifact details without provider messages', async () => {
		const ctx = createTestContext();
		const originalInsert = ctx.store.insert.bind(ctx.store);
		vi.spyOn(ctx.store, 'insert').mockImplementation(async (table, orgId, data) => {
			if (table === 'training_types' && data.name === 'Required Annual Training') {
				throw new Error('duplicate key value violates unique constraint training_types_name_key');
			}
			return originalInsert(table, orgId, data);
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
