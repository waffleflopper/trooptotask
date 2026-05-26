import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _postConfig } from './+server';

describe('/api/organization/settings', () => {
	it('uses the organization settings governance policy for settings updates', async () => {
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.organization.updateSettings);
		expect(_postConfig.policyResource).toEqual({ kind: 'organization' });
		expect(_postConfig.mutation).toBe(true);

		const memberCtx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(handleUseCaseRequest(_postConfig, memberCtx, { lossWarningWindowDays: 90 })).rejects.toMatchObject({
			status: 403
		});
	});

	it('persists archive retention, loss warning, and Critical Tasks settings on the organization row', async () => {
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

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			archiveRetentionMonths: 48,
			lossWarningWindowDays: 90,
			criticalTasksDefaultExpirationMonths: 18,
			criticalTasksExpiringSoonWarningDays: 45,
			personnelDocumentStorageCapMb: 256
		});
		const saved = await ctx.rawStore.findOne<Record<string, unknown>>('organizations', ctx.auth.orgId, {
			id: ctx.auth.orgId
		});

		expect(result).toEqual({ success: true });
		expect(saved).toMatchObject({
			archive_retention_months: 48,
			loss_warning_window_days: 90,
			critical_tasks_default_expiration_months: 18,
			critical_tasks_expiring_soon_warning_days: 45,
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
					critical_tasks_default_expiration_months: 18,
					critical_tasks_expiring_soon_warning_days: 45,
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

		const result = await handleUseCaseRequest(_postConfig, ctx, { lossWarningWindowDays: 90 });
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

	it('rejects invalid warning-window values before writing', async () => {
		const ctx = createTestContext();
		const updateById = vi.spyOn(ctx.rawStore, 'updateById');

		await expect(handleUseCaseRequest(_postConfig, ctx, { lossWarningWindowDays: 0 })).rejects.toThrow(
			'Warning window must be between 1 and 365 days'
		);
		expect(updateById).not.toHaveBeenCalled();
	});

	it('rejects invalid personnel document cap values before writing', async () => {
		const ctx = createTestContext();
		const updateById = vi.spyOn(ctx.rawStore, 'updateById');

		await expect(handleUseCaseRequest(_postConfig, ctx, { personnelDocumentStorageCapMb: 9 })).rejects.toThrow(
			'Personnel document storage cap must be between 10 and 1024 MB'
		);
		expect(updateById).not.toHaveBeenCalled();
	});
});
