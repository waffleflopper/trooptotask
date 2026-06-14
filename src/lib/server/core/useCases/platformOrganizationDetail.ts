import type { AdminRole } from '$lib/server/admin';
import { visibleBillingSnapshotForAdminRole } from '$lib/server/adminBillingVisibility';
import type { BillingCancellationSummary, BillingSnapshot, Tier } from '$lib/types/subscription';
import { summarizeBillingCancellation } from './billingState';
import type { PlatformAudit, PlatformAuditOrganizationActivity } from './platformAudit';
import type { PlatformGifting } from './platformGifting';
import type { PlatformMembershipAdministration, PlatformMembershipRole } from './platformMembershipAdministration';
import type { PlatformMetrics } from './platformMetrics';
import type { PlanAdminDiagnostics } from './planAdminDiagnostics';
import type { EffectivePlanPolicy, PlanFeatureEntitlement } from './planPolicy';

export interface PlatformOrganizationDetailOrganizationRow {
	id: string;
	name: string;
	tier: Tier | null;
	gift_tier: Tier | null;
	gift_expires_at: string | null;
	suspended_at: string | null;
	created_at: string;
}

export interface PlatformOrganizationDetailStore {
	getOrganizationById(orgId: string): Promise<PlatformOrganizationDetailOrganizationRow | null>;
	getBillingSnapshotByOrganization(orgId: string): Promise<BillingSnapshot | null>;
}

export interface PlatformOrganizationDetailMember {
	userId: string;
	email: string;
	role: PlatformMembershipRole;
}

export interface PlatformOrganizationDetailOrg {
	id: string;
	name: string;
	subscriptionTier: string;
	giftTier: Tier | null;
	giftExpiresAt: string | null;
	suspendedAt: string | null;
	createdAt: string;
	effectiveTier: string;
	isSuspended: boolean;
}

export interface PlatformOrganizationDetailPlanPolicy {
	source: EffectivePlanPolicy['source'];
	billingSource: EffectivePlanPolicy['billingSource'];
	entitlements: PlanFeatureEntitlement[];
}

export interface PlatformOrganizationDetailLoadData {
	adminRole: AdminRole;
	org: PlatformOrganizationDetailOrg;
	billingSnapshot: BillingSnapshot | null;
	planPolicy: PlatformOrganizationDetailPlanPolicy;
	planDiagnostics: PlanAdminDiagnostics;
	cancellationSummary: BillingCancellationSummary | null;
	members: PlatformOrganizationDetailMember[];
	personnelCount: number;
	auditEvents: PlatformAuditOrganizationActivity[];
}

export type PlatformOrganizationDetailResult =
	| { status: 'found'; detail: PlatformOrganizationDetailLoadData }
	| { status: 'not_found' }
	| { status: 'provider_error'; message: string };

export interface PlatformOrganizationDetail {
	getOrganizationDetail(orgId: string): Promise<PlatformOrganizationDetailResult>;
}

export interface PlatformOrganizationDetailPlanContext {
	planPolicy: EffectivePlanPolicy;
	planDiagnostics: PlanAdminDiagnostics;
}

export interface PlatformOrganizationDetailDependencies {
	store: PlatformOrganizationDetailStore;
	adminRole: AdminRole;
	gifting: PlatformGifting;
	membershipAdministration: PlatformMembershipAdministration;
	metrics: PlatformMetrics;
	audit: PlatformAudit;
	readPlanContext(orgId: string): Promise<PlatformOrganizationDetailPlanContext>;
	logError?: (message: string, error: unknown) => void;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? 'Unknown provider error');
}

function planPolicyForPage(planPolicy: EffectivePlanPolicy): PlatformOrganizationDetailPlanPolicy {
	return {
		source: planPolicy.source,
		billingSource: planPolicy.billingSource,
		entitlements: Object.values(planPolicy.entitlements)
	};
}

export function createPlatformOrganizationDetail(
	deps: PlatformOrganizationDetailDependencies
): PlatformOrganizationDetail {
	const logError = deps.logError ?? ((message, error) => console.error(message, error));

	return {
		async getOrganizationDetail(orgId) {
			let org: PlatformOrganizationDetailOrganizationRow | null;
			try {
				org = await deps.store.getOrganizationById(orgId);
			} catch (error) {
				return { status: 'provider_error', message: errorMessage(error) };
			}

			if (!org) return { status: 'not_found' };

			const giftState = (await deps.gifting.getOrganizationGiftState(orgId).catch((error) => {
				logError('[admin/organizations] Failed to load gift state:', error);
				return null;
			})) ?? {
				giftTier: org.gift_tier,
				giftExpiresAt: org.gift_expires_at
			};

			try {
				const memberships = await deps.membershipAdministration.listMembers(orgId);
				const members = memberships.map((membership) => ({
					userId: membership.userId,
					email: membership.email ?? '(unknown)',
					role: membership.role
				}));

				const personnelCount = await deps.metrics.countActivePersonnelForOrganization(orgId);
				const auditEvents = await deps.audit.listRecentByOrganization({ orgId, limit: 10 });
				const billingSnapshot = visibleBillingSnapshotForAdminRole(
					deps.adminRole,
					await deps.store.getBillingSnapshotByOrganization(orgId)
				);
				const { planPolicy, planDiagnostics } = await deps.readPlanContext(orgId);
				const effectiveTier = (giftState.giftTier ?? org.tier ?? 'free') as string;

				return {
					status: 'found',
					detail: {
						adminRole: deps.adminRole,
						org: {
							id: org.id,
							name: org.name,
							subscriptionTier: org.tier as string,
							giftTier: giftState.giftTier,
							giftExpiresAt: giftState.giftExpiresAt,
							suspendedAt: org.suspended_at,
							createdAt: org.created_at,
							effectiveTier,
							isSuspended: !!org.suspended_at
						},
						billingSnapshot,
						planPolicy: planPolicyForPage(planPolicy),
						planDiagnostics,
						cancellationSummary: billingSnapshot ? summarizeBillingCancellation(billingSnapshot) : null,
						members,
						personnelCount,
						auditEvents
					}
				};
			} catch (error) {
				return { status: 'provider_error', message: errorMessage(error) };
			}
		}
	};
}
