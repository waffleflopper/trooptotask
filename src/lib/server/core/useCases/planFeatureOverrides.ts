import type { AuditPort, DataStore } from '$lib/server/core/ports';
import type { AdminRole } from '$lib/server/admin';
import { isPlanFeatureKey, type PlanFeatureKey, type PlanFeatureOverrideState } from './planPolicy';

interface PlanFeatureOverridePorts {
	store: DataStore;
	audit: AuditPort;
	admin: {
		userId: string;
		role: AdminRole;
	};
}

export interface GrantPlanFeatureOverrideInput {
	orgId: string;
	featureKey: PlanFeatureKey;
	state: PlanFeatureOverrideState;
	expiresAt: string | null;
	reason?: string | null;
}

export interface RevokePlanFeatureOverrideInput {
	orgId: string;
	overrideId: string;
}

export interface PlanFeatureOverrideRecord {
	id: string;
	organization_id: string;
	feature_key: PlanFeatureKey;
	override_state: PlanFeatureOverrideState;
	expires_at: string | null;
	reason: string | null;
	created_by: string;
	created_at: string;
	revoked_at: string | null;
	revoked_by: string | null;
}

function normalizeExpiresAt(value: string | null): string | null {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error('Invalid feature override expiry.');
	}
	return parsed.toISOString();
}

function normalizeReason(value: string | null | undefined): string | null {
	const reason = value?.trim() || null;
	if (reason && reason.length > 500) {
		throw new Error('Feature override reason must be 500 characters or less.');
	}
	return reason;
}

function assertKnownFeatureKey(featureKey: PlanFeatureKey): void {
	if (!isPlanFeatureKey(featureKey)) {
		throw new Error('Unknown plan feature key.');
	}
}

function requireSuperAdmin(ports: PlanFeatureOverridePorts): void {
	if (ports.admin.role !== 'super_admin') {
		throw new Error('Not authorized for plan feature overrides.');
	}
}

export async function grantOrganizationPlanFeatureOverride(
	ports: PlanFeatureOverridePorts,
	input: GrantPlanFeatureOverrideInput
): Promise<PlanFeatureOverrideRecord> {
	requireSuperAdmin(ports);
	assertKnownFeatureKey(input.featureKey);
	const expiresAt = normalizeExpiresAt(input.expiresAt);
	const reason = normalizeReason(input.reason);

	const activeExisting = await ports.store.findMany<PlanFeatureOverrideRecord>(
		'organization_plan_feature_overrides',
		input.orgId,
		{ feature_key: input.featureKey },
		{ isNull: { revoked_at: true } }
	);
	const activeExistingRestore = activeExisting.map((override) => ({
		id: override.id,
		revoked_at: override.revoked_at,
		revoked_by: override.revoked_by
	}));
	const revokedAt = new Date().toISOString();
	await Promise.all(
		activeExisting.map((override) =>
			ports.store.update('organization_plan_feature_overrides', input.orgId, override.id, {
				revoked_at: revokedAt,
				revoked_by: ports.admin.userId
			})
		)
	);

	let row: PlanFeatureOverrideRecord;
	try {
		row = await ports.store.insert<PlanFeatureOverrideRecord>('organization_plan_feature_overrides', input.orgId, {
			feature_key: input.featureKey,
			override_state: input.state,
			expires_at: expiresAt,
			reason,
			created_by: ports.admin.userId,
			created_at: new Date().toISOString(),
			revoked_at: null,
			revoked_by: null
		});
	} catch (error) {
		await Promise.all(
			activeExistingRestore.map((override) =>
				ports.store.update('organization_plan_feature_overrides', input.orgId, override.id, {
					revoked_at: override.revoked_at,
					revoked_by: override.revoked_by
				})
			)
		);
		throw error;
	}

	for (const override of activeExisting) {
		ports.audit.log({
			action: 'admin.plan_feature_override.superseded',
			resourceType: 'organization',
			resourceId: input.orgId,
			orgId: input.orgId,
			severity: 'warning',
			details: {
				overrideId: override.id,
				featureKey: override.feature_key,
				overrideState: override.override_state,
				replacementOverrideState: input.state
			}
		});
	}

	ports.audit.log({
		action: 'admin.plan_feature_override.set',
		resourceType: 'organization',
		resourceId: input.orgId,
		orgId: input.orgId,
		severity: 'warning',
		details: {
			featureKey: input.featureKey,
			overrideState: input.state,
			expiresAt,
			hasReason: !!reason
		}
	});

	return row;
}

export async function revokeOrganizationPlanFeatureOverride(
	ports: PlanFeatureOverridePorts,
	input: RevokePlanFeatureOverrideInput
): Promise<PlanFeatureOverrideRecord> {
	requireSuperAdmin(ports);

	const existing = await ports.store.findOne<PlanFeatureOverrideRecord>(
		'organization_plan_feature_overrides',
		input.orgId,
		{ id: input.overrideId }
	);
	if (!existing) {
		throw new Error('Plan feature override not found.');
	}
	if (existing.revoked_at) {
		throw new Error('Plan feature override is already revoked.');
	}

	const row = await ports.store.update<PlanFeatureOverrideRecord>(
		'organization_plan_feature_overrides',
		input.orgId,
		input.overrideId,
		{
			revoked_at: new Date().toISOString(),
			revoked_by: ports.admin.userId
		}
	);

	ports.audit.log({
		action: 'admin.plan_feature_override.revoked',
		resourceType: 'organization',
		resourceId: input.orgId,
		orgId: input.orgId,
		severity: 'warning',
		details: {
			overrideId: input.overrideId,
			featureKey: existing.feature_key,
			overrideState: existing.override_state
		}
	});

	return row;
}
