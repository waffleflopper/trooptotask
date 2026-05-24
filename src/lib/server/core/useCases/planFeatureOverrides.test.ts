import { describe, expect, it } from 'vitest';
import { createInMemoryDataStore, createTestAuditPort } from '$lib/server/adapters/inMemory';
import { grantOrganizationPlanFeatureOverride, revokeOrganizationPlanFeatureOverride } from './planFeatureOverrides';

function makePorts(role: 'super_admin' | 'support' | 'billing' = 'super_admin') {
	return {
		store: createInMemoryDataStore(),
		audit: createTestAuditPort(),
		admin: { userId: 'admin-1', role }
	};
}

describe('plan feature overrides', () => {
	it('grants a feature override and audits support-safe details', async () => {
		const ports = makePorts();

		const result = await grantOrganizationPlanFeatureOverride(ports, {
			orgId: 'org-1',
			featureKey: 'advanced_reporting',
			state: 'granted',
			expiresAt: '2999-01-01T00:00:00.000Z',
			reason: 'Comp account for command pilot'
		});

		expect(result).toMatchObject({
			organization_id: 'org-1',
			feature_key: 'advanced_reporting',
			override_state: 'granted',
			expires_at: '2999-01-01T00:00:00.000Z',
			created_by: 'admin-1',
			revoked_at: null
		});
		expect(ports.audit.events).toEqual([
			{
				action: 'admin.plan_feature_override.set',
				resourceType: 'organization',
				resourceId: 'org-1',
				orgId: 'org-1',
				severity: 'warning',
				details: {
					featureKey: 'advanced_reporting',
					overrideState: 'granted',
					expiresAt: '2999-01-01T00:00:00.000Z',
					hasReason: true
				}
			}
		]);
	});

	it('rejects invalid expiry and oversized reasons before persistence or audit', async () => {
		const ports = makePorts();

		await expect(
			grantOrganizationPlanFeatureOverride(ports, {
				orgId: 'org-1',
				featureKey: 'advanced_reporting',
				state: 'granted',
				expiresAt: 'not-a-date',
				reason: null
			})
		).rejects.toThrow('Invalid feature override expiry.');

		await expect(
			grantOrganizationPlanFeatureOverride(ports, {
				orgId: 'org-1',
				featureKey: 'advanced_reporting',
				state: 'granted',
				expiresAt: null,
				reason: 'x'.repeat(501)
			})
		).rejects.toThrow('Feature override reason must be 500 characters or less.');

		expect(await ports.store.findMany('organization_plan_feature_overrides', 'org-1')).toEqual([]);
		expect(ports.audit.events).toEqual([]);
	});

	it('revokes a feature override without deleting the source record', async () => {
		const ports = makePorts();
		ports.store.seed('organization_plan_feature_overrides', [
			{
				id: 'override-1',
				organization_id: 'org-1',
				feature_key: 'advanced_reporting',
				override_state: 'granted',
				expires_at: null,
				reason: 'Temporary enablement',
				created_by: 'admin-1',
				created_at: '2026-05-24T00:00:00.000Z',
				revoked_at: null,
				revoked_by: null
			}
		]);

		const result = await revokeOrganizationPlanFeatureOverride(ports, {
			orgId: 'org-1',
			overrideId: 'override-1'
		});

		expect(result).toMatchObject({
			id: 'override-1',
			organization_id: 'org-1',
			revoked_by: 'admin-1'
		});
		expect(result.revoked_at).toEqual(expect.any(String));
		expect(ports.audit.events).toEqual([
			{
				action: 'admin.plan_feature_override.revoked',
				resourceType: 'organization',
				resourceId: 'org-1',
				orgId: 'org-1',
				severity: 'warning',
				details: {
					overrideId: 'override-1',
					featureKey: 'advanced_reporting',
					overrideState: 'granted'
				}
			}
		]);
	});

	it('rejects an already revoked feature override without changing audit history', async () => {
		const ports = makePorts();
		ports.store.seed('organization_plan_feature_overrides', [
			{
				id: 'override-1',
				organization_id: 'org-1',
				feature_key: 'advanced_reporting',
				override_state: 'granted',
				expires_at: null,
				reason: 'Temporary enablement',
				created_by: 'admin-1',
				created_at: '2026-05-24T00:00:00.000Z',
				revoked_at: '2026-05-24T01:00:00.000Z',
				revoked_by: 'admin-1'
			}
		]);

		await expect(
			revokeOrganizationPlanFeatureOverride(ports, {
				orgId: 'org-1',
				overrideId: 'override-1'
			})
		).rejects.toThrow('Plan feature override is already revoked.');

		const rows = await ports.store.findMany<{ revoked_at: string }>('organization_plan_feature_overrides', 'org-1');
		expect(rows[0].revoked_at).toBe('2026-05-24T01:00:00.000Z');
		expect(ports.audit.events).toEqual([]);
	});

	it('denies feature override changes for platform admins below super_admin', async () => {
		const ports = makePorts('billing');

		await expect(
			grantOrganizationPlanFeatureOverride(ports, {
				orgId: 'org-1',
				featureKey: 'advanced_reporting',
				state: 'granted',
				expiresAt: null
			})
		).rejects.toThrow('Not authorized for plan feature overrides.');

		expect(await ports.store.findMany('organization_plan_feature_overrides', 'org-1')).toEqual([]);
		expect(ports.audit.events).toEqual([]);
	});

	it('closes prior active overrides for the same feature before recording the new source', async () => {
		const ports = makePorts();
		ports.store.seed('organization_plan_feature_overrides', [
			{
				id: 'override-1',
				organization_id: 'org-1',
				feature_key: 'advanced_reporting',
				override_state: 'granted',
				expires_at: null,
				reason: null,
				created_by: 'admin-1',
				created_at: '2026-05-24T00:00:00.000Z',
				revoked_at: null,
				revoked_by: null
			}
		]);

		await grantOrganizationPlanFeatureOverride(ports, {
			orgId: 'org-1',
			featureKey: 'advanced_reporting',
			state: 'denied',
			expiresAt: null
		});

		const rows = await ports.store.findMany<{ id: string; revoked_at: string | null; revoked_by: string | null }>(
			'organization_plan_feature_overrides',
			'org-1',
			undefined,
			{ orderBy: [{ column: 'created_at', ascending: true }] }
		);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			id: 'override-1',
			revoked_at: expect.any(String),
			revoked_by: 'admin-1'
		});
		expect(rows[1]).toMatchObject({
			override_state: 'denied',
			revoked_at: null,
			revoked_by: null
		});
		expect(ports.audit.events).toEqual([
			{
				action: 'admin.plan_feature_override.superseded',
				resourceType: 'organization',
				resourceId: 'org-1',
				orgId: 'org-1',
				severity: 'warning',
				details: {
					overrideId: 'override-1',
					featureKey: 'advanced_reporting',
					overrideState: 'granted',
					replacementOverrideState: 'denied'
				}
			},
			expect.objectContaining({
				action: 'admin.plan_feature_override.set',
				details: expect.objectContaining({
					featureKey: 'advanced_reporting',
					overrideState: 'denied'
				})
			})
		]);
	});
});
