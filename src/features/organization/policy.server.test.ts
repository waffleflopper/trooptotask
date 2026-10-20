import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { updateOrganizationSettings } from './policy.server';

describe('Organization policy updates', () => {
	it('persists Organization policy and storage settings without touching Critical Tasks defaults', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				organization_id: ctx.auth.orgId,
				archive_retention_months: 36,
				loss_warning_window_days: 180,
				critical_tasks_default_expiration_months: null,
				critical_tasks_expiring_soon_warning_days: null,
				personnel_document_storage_cap_bytes: 104857600
			}
		]);

		const result = await updateOrganizationSettings(ctx, {
			archiveRetentionMonths: 48,
			lossWarningWindowDays: 90,
			personnelDocumentStorageCapMb: 256
		});
		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(result).toEqual({ success: true });
		expect(saved).toMatchObject({
			archive_retention_months: 48,
			loss_warning_window_days: 90,
			critical_tasks_default_expiration_months: null,
			critical_tasks_expiring_soon_warning_days: null,
			personnel_document_storage_cap_bytes: 268435456
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'organization.settings_updated',
				resourceType: 'organization',
				resourceId: ctx.auth.orgId,
				details: {
					archive_retention_months: 48,
					loss_warning_window_days: 90,
					personnel_document_storage_cap_bytes: 268435456
				}
			})
		]);
	});

	it('supports partial updates for the warning window without rewriting other settings', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				organization_id: ctx.auth.orgId,
				archive_retention_months: 36,
				loss_warning_window_days: 180,
				critical_tasks_default_expiration_months: 12,
				critical_tasks_expiring_soon_warning_days: 60,
				personnel_document_storage_cap_bytes: 104857600
			}
		]);

		const result = await updateOrganizationSettings(ctx, { lossWarningWindowDays: 90 });
		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(result).toEqual({ success: true });
		expect(saved).toMatchObject({
			archive_retention_months: 36,
			loss_warning_window_days: 90,
			critical_tasks_default_expiration_months: 12,
			critical_tasks_expiring_soon_warning_days: 60,
			personnel_document_storage_cap_bytes: 104857600
		});
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'organization.settings_updated',
				resourceType: 'organization',
				resourceId: ctx.auth.orgId,
				details: { loss_warning_window_days: 90 }
			})
		]);
	});

	it.each([
		{},
		{ lossWarningWindowDays: null },
		{ lossWarningWindowDays: '90' },
		{ lossWarningWindowDays: Number.NaN },
		{ lossWarningWindowDays: Number.POSITIVE_INFINITY },
		{ archiveRetentionMonths: 0.49 },
		{ archiveRetentionMonths: 120.5 },
		{ lossWarningWindowDays: 365.5 },
		{ personnelDocumentStorageCapMb: 9.49 },
		{ personnelDocumentStorageCapMb: 1024.5 },
		{ trainingReadinessGoalPercent: 0 },
		{ trainingReadinessGoalPercent: 101 },
		{ trainingReadinessGoalPercent: 90.5 },
		{ trainingReadinessGoalPercent: null },
		{ trainingReadinessGoalPercent: '90' },
		{ archiveRetentionMonths: 48, criticalTasksDefaultExpirationMonths: null },
		{ lossWarningWindowDays: 90, criticalTasksExpiringSoonWarningDays: undefined }
	])('rejects invalid/empty/retired inputs before any write or success audit (%j)', async (input) => {
		const ctx = createTestContext();
		const update = vi.spyOn(ctx.organizationPolicyWrite, 'updatePolicies');
		await expect(updateOrganizationSettings(ctx, input as never)).rejects.toMatchObject({ status: 400 });
		expect(update).not.toHaveBeenCalled();
		expect(ctx.auditPort.events).toEqual([]);
	});

	it.each([1, 100])('stores and audits the whole-number readiness goal boundary %i alone', async (goal) => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{ id: ctx.auth.orgId, loss_warning_window_days: 180, training_readiness_goal_percent: 90 }
		]);
		expect(await updateOrganizationSettings(ctx, { trainingReadinessGoalPercent: goal })).toEqual({ success: true });
		expect(await ctx.rawStore.findOne('organizations', ctx.auth.orgId, {})).toMatchObject({
			loss_warning_window_days: 180,
			training_readiness_goal_percent: goal
		});
		expect(ctx.auditPort.events).toMatchObject([{ details: { training_readiness_goal_percent: goal } }]);
	});

	it.each(['owner', 'admin', 'member'] as const)(
		'keeps Organization policy authority independent of Personnel configure (%s)',
		async (role) => {
			const ctx = createTestContext({
				auth: {
					role,
					isPrivileged: role !== 'member',
					capabilityMap: {
						calendar: 'none',
						personnel: 'configure',
						training: 'none',
						criticalTasks: 'none',
						onboarding: 'none',
						ratingScheme: 'none'
					}
				}
			});
			ctx.rawStore.seed('organizations', [{ id: ctx.auth.orgId, loss_warning_window_days: 180 }]);
			if (role === 'member') {
				await expect(updateOrganizationSettings(ctx, { lossWarningWindowDays: 90 })).rejects.toMatchObject({
					status: 403
				});
				expect(ctx.auditPort.events).toMatchObject([
					{
						action: 'policy.denied',
						details: { policyAction: 'organization.updateSettings', reasonCode: 'denied:governance-role' }
					}
				]);
				expect(await ctx.rawStore.findOne('organizations', ctx.auth.orgId, {})).toMatchObject({
					loss_warning_window_days: 180
				});
			} else {
				expect(await updateOrganizationSettings(ctx, { lossWarningWindowDays: 90 })).toEqual({ success: true });
				expect(await ctx.rawStore.findOne('organizations', ctx.auth.orgId, {})).toMatchObject({
					loss_warning_window_days: 90
				});
			}
		}
	);

	it('rounds before range validation, converts MiB and ignores undefined fields in the changed-field audit', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				archive_retention_months: 36,
				loss_warning_window_days: 180,
				personnel_document_storage_cap_bytes: 104857600
			}
		]);
		expect(
			await updateOrganizationSettings(ctx, {
				archiveRetentionMonths: 0.5,
				lossWarningWindowDays: 365.49,
				personnelDocumentStorageCapMb: 9.5
			})
		).toEqual({ success: true });
		expect(await ctx.rawStore.findOne('organizations', ctx.auth.orgId, {})).toMatchObject({
			archive_retention_months: 1,
			loss_warning_window_days: 365,
			personnel_document_storage_cap_bytes: 10485760
		});
		expect(
			await updateOrganizationSettings(ctx, { archiveRetentionMonths: undefined, lossWarningWindowDays: 90.5 })
		).toEqual({ success: true });
		expect(ctx.auditPort.events[1]).toMatchObject({ details: { loss_warning_window_days: 91 } });
	});

	it('changes one feature switch against the stored set and audits what it replaced', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{ id: ctx.auth.orgId, disabled_features: ['onboarding'], strength_floor_percent: 80 }
		]);

		expect(
			await updateOrganizationSettings(ctx, {
				featureSwitch: { feature: 'training', on: false },
				strengthFloorPercent: 65
			})
		).toEqual({ success: true });
		expect(await updateOrganizationSettings(ctx, { featureSwitch: { feature: 'onboarding', on: true } })).toEqual({
			success: true
		});

		expect(await ctx.rawStore.findOne('organizations', ctx.auth.orgId, {})).toMatchObject({
			disabled_features: ['training'],
			strength_floor_percent: 65
		});
		expect(ctx.auditPort.events.map((event) => event.details)).toEqual([
			{
				previous_disabled_features: ['onboarding'],
				disabled_features: ['training', 'onboarding'],
				previous_strength_floor_percent: 80,
				strength_floor_percent: 65
			},
			{ previous_disabled_features: ['training', 'onboarding'], disabled_features: ['training'] }
		]);
	});

	it.each([
		[{ featureSwitch: { feature: 'dutyRoster', on: false } }, 'field:featureSwitch'],
		[{ featureSwitch: { feature: 'training' } }, 'field:featureSwitch'],
		[{ featureSwitch: 'training' }, 'field:featureSwitch'],
		[{ strengthFloorPercent: 0 }, 'field:strengthFloorPercent'],
		[{ strengthFloorPercent: 101 }, 'field:strengthFloorPercent'],
		[{ strengthFloorPercent: 79.5 }, 'field:strengthFloorPercent']
	])('rejects %j with a field error before any write', async (input, reason) => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [{ id: ctx.auth.orgId, disabled_features: [], strength_floor_percent: 80 }]);

		await expect(updateOrganizationSettings(ctx, input as never)).rejects.toMatchObject({ status: 400, reason });
		expect(await ctx.rawStore.findOne('organizations', ctx.auth.orgId, {})).toMatchObject({
			disabled_features: [],
			strength_floor_percent: 80
		});
		expect(ctx.auditPort.events).toEqual([]);
	});
});
