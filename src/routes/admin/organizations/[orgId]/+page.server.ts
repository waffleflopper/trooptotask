import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { validateUUID } from '$lib/server/validation';
import { createStripeBillingReconciliationProvider, pauseSubscription, resumeSubscription } from '$lib/server/stripe';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { invalidateTierCache } from '$lib/server/subscription';
import { summarizeBillingCancellation } from '$lib/server/core/useCases/billingState';
import { reconcileOrganizationBilling } from '$lib/server/core/useCases/billingReconciliation';
import { configuredPriceCatalog } from '$lib/server/billing/priceCatalog';
import { createSupabaseBillingReconciliationStore } from '$lib/server/adapters/supabaseBillingReconciliation';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';
import {
	grantOrganizationPlanFeatureOverride,
	revokeOrganizationPlanFeatureOverride
} from '$lib/server/core/useCases/planFeatureOverrides';
import {
	PLAN_FEATURE_REGISTRY,
	readEffectivePlanPolicy,
	type PlanFeatureKey
} from '$lib/server/core/useCases/planPolicy';
import { readOrganizationPlanUsage } from '$lib/server/core/useCases/organizationPlanUsage';
import { buildPlanAdminDiagnostics } from '$lib/server/core/useCases/planAdminDiagnostics';
import { visibleBillingSnapshotForAdminRole } from '$lib/server/adminBillingVisibility';
import type { BillingSnapshot } from '$lib/types/subscription';

const TIER_RANK: Record<string, number> = { free: 1, team: 2, unit: 3 };

function sanitizeBillingReconciliationDiagnostic(value: unknown): string {
	const message = value instanceof Error ? value.message : String(value ?? 'unknown_error');
	return message
		.replace(/[sr]k_(live|test)_[A-Za-z0-9_]+/g, '[redacted_stripe_key]')
		.replace(/whsec_\S+/g, '[redacted_webhook_secret]')
		.replace(/bearer\s+\S+/gi, 'bearer [redacted]');
}

function isPlanFeatureKey(value: string): value is PlanFeatureKey {
	return value in PLAN_FEATURE_REGISTRY;
}

function parseFeatureOverrideExpiry(value: string | null): string | null | { error: string } {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return { error: 'Invalid expiry date' };
	return parsed.toISOString();
}

function parseFeatureOverrideReason(value: string | null): string | null | { error: string } {
	const reason = value?.trim() || null;
	if (reason && reason.length > 500) return { error: 'Reason must be 500 characters or less' };
	return reason;
}

type AdminOrganizationBillingSnapshotRow = {
	organization_id: string;
	source: BillingSnapshot['source'];
	commercial_plan: BillingSnapshot['commercialPlan'];
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	stripe_product_id: string | null;
	stripe_price_id: string | null;
	subscription_status: BillingSnapshot['subscriptionStatus'];
	collection_status: string | null;
	current_period_start: string | null;
	current_period_end: string | null;
	cancel_at_period_end: boolean | null;
	canceled_at: string | null;
	trial_end: string | null;
	sync_status: BillingSnapshot['syncStatus'];
	last_stripe_event_id: string | null;
	last_stripe_event_type: string | null;
	last_stripe_event_created_at: string | null;
	last_processed_at: string | null;
	last_reconciled_at: string | null;
	reconciliation_result: string | null;
	drift_detected: boolean | null;
};

function mapAdminOrganizationBillingSnapshot(row: AdminOrganizationBillingSnapshotRow): BillingSnapshot {
	return {
		organizationId: row.organization_id,
		source: row.source,
		commercialPlan: row.commercial_plan,
		stripeCustomerId: row.stripe_customer_id,
		stripeSubscriptionId: row.stripe_subscription_id,
		stripeProductId: row.stripe_product_id,
		stripePriceId: row.stripe_price_id,
		subscriptionStatus: row.subscription_status,
		collectionStatus: row.collection_status,
		currentPeriodStart: row.current_period_start,
		currentPeriodEnd: row.current_period_end,
		cancelAtPeriodEnd: row.cancel_at_period_end ?? false,
		canceledAt: row.canceled_at,
		trialEnd: row.trial_end,
		syncStatus: row.sync_status,
		lastStripeEventId: row.last_stripe_event_id,
		lastStripeEventType: row.last_stripe_event_type,
		lastStripeEventCreatedAt: row.last_stripe_event_created_at,
		lastProcessedAt: row.last_processed_at,
		lastReconciledAt: row.last_reconciled_at,
		reconciliationResult: row.reconciliation_result,
		driftDetected: row.drift_detected ?? false,
		giftTier: null,
		giftExpiresAt: null
	};
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'organizations',
	fn: async (ctx, event) => {
		const { adminClient } = ctx;
		const orgId = event.params.orgId as string;
		if (!validateUUID(orgId)) throw error(400, 'Invalid organization ID');

		const { data: org, error: orgError } = await adminClient
			.from('organizations')
			.select('id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at')
			.eq('id', orgId)
			.single();

		if (orgError || !org) throw error(404, 'Organization not found');

		const { data: memberships } = await selectAllSupabaseRows<{ user_id: string; role: string; email: string | null }>(
			(from, to) =>
				adminClient
					.from('organization_memberships')
					.select('user_id, role, email')
					.eq('organization_id', orgId)
					.order('role')
					.range(from, to) as unknown as Promise<{
					data: { user_id: string; role: string; email: string | null }[] | null;
					error: unknown;
				}>
		);

		const members = (memberships ?? []).map((m) => ({
			userId: m.user_id,
			email: m.email ?? '(unknown)',
			role: m.role as string
		}));

		const { count: personnelCount } = await adminClient
			.from('personnel')
			.select('*', { count: 'exact', head: true })
			.eq('organization_id', orgId)
			.is('archived_at', null);

		const { data: auditEvents } = await adminClient
			.from('audit_logs')
			.select('id, action, user_id, timestamp, severity, resource_type, resource_id')
			.eq('org_id', orgId)
			.order('timestamp', { ascending: false })
			.limit(10);

		const { data: billingSnapshotRow } = await adminClient
			.from('organization_billing_snapshots')
			.select(
				'organization_id, source, commercial_plan, stripe_customer_id, stripe_subscription_id, stripe_product_id, stripe_price_id, subscription_status, collection_status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, trial_end, sync_status, last_stripe_event_id, last_stripe_event_type, last_stripe_event_created_at, last_processed_at, last_reconciled_at, reconciliation_result, drift_detected'
			)
			.eq('organization_id', orgId)
			.maybeSingle<AdminOrganizationBillingSnapshotRow>();
		const billingSnapshot = visibleBillingSnapshotForAdminRole(
			ctx.adminUser.role,
			billingSnapshotRow ? mapAdminOrganizationBillingSnapshot(billingSnapshotRow) : null
		);
		const dataStore = createSupabaseDataStore(adminClient);
		const [planPolicy, planUsage] = await Promise.all([
			readEffectivePlanPolicy({
				store: dataStore,
				auth: { orgId }
			}),
			readOrganizationPlanUsage({
				store: dataStore,
				auth: { orgId }
			})
		]);
		const planDiagnostics = buildPlanAdminDiagnostics(planPolicy, planUsage);

		const effectiveTier = (org.gift_tier ?? org.tier ?? 'free') as string;

		return {
			adminRole: ctx.adminUser.role,
			org: {
				id: org.id,
				name: org.name,
				subscriptionTier: org.tier as string,
				giftTier: org.gift_tier as string | null,
				giftExpiresAt: org.gift_expires_at as string | null,
				suspendedAt: org.suspended_at as string | null,
				createdAt: org.created_at as string,
				effectiveTier,
				isSuspended: !!org.suspended_at
			},
			billingSnapshot,
			planPolicy: {
				source: planPolicy.source,
				billingSource: planPolicy.billingSource,
				entitlements: Object.values(planPolicy.entitlements)
			},
			planDiagnostics,
			cancellationSummary: billingSnapshot ? summarizeBillingCancellation(billingSnapshot) : null,
			members,
			personnelCount: personnelCount ?? 0,
			auditEvents: (auditEvents ?? []).map((e) => ({
				id: e.id as string,
				action: e.action as string,
				userId: e.user_id as string | null,
				timestamp: e.timestamp as string,
				severity: e.severity as string,
				resourceType: e.resource_type as string,
				resourceId: e.resource_id as string | null
			}))
		};
	}
});

export const actions: Actions = {
	transferOwnership: adminAction({
		page: 'organizations',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;
			const orgId = event.params.orgId as string;
			if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

			const formData = await event.request.formData();
			const targetUserId = formData.get('targetUserId')?.toString() ?? '';
			const confirmName = formData.get('confirmName')?.toString() ?? '';

			if (!validateUUID(targetUserId)) return fail(400, { error: { message: 'Invalid target user ID' } });

			const { data: org } = await adminClient.from('organizations').select('id, name').eq('id', orgId).single();
			if (!org) return fail(404, { error: { message: 'Organization not found' } });
			if (confirmName !== org.name) return fail(400, { error: { message: 'Organization name does not match' } });

			const { data: targetMembership } = await adminClient
				.from('organization_memberships')
				.select('user_id, role')
				.eq('organization_id', orgId)
				.eq('user_id', targetUserId)
				.single();

			if (!targetMembership)
				return fail(400, { error: { message: 'Target user is not a member of this organization' } });
			if (targetMembership.role === 'owner')
				return fail(400, { error: { message: 'Target user is already the owner' } });

			const { data: currentOwnerMembership } = await adminClient
				.from('organization_memberships')
				.select('user_id')
				.eq('organization_id', orgId)
				.eq('role', 'owner')
				.single();

			if (!currentOwnerMembership) return fail(500, { error: { message: 'Could not find current owner' } });

			const { error: demoteError } = await adminClient
				.from('organization_memberships')
				.update({ role: 'admin' })
				.eq('organization_id', orgId)
				.eq('user_id', currentOwnerMembership.user_id);

			if (demoteError) return fail(500, { error: { message: 'Transfer failed during demotion' } });

			const { error: promoteError } = await adminClient
				.from('organization_memberships')
				.update({ role: 'owner' })
				.eq('organization_id', orgId)
				.eq('user_id', targetUserId);

			if (promoteError) {
				await adminClient
					.from('organization_memberships')
					.update({ role: 'owner' })
					.eq('organization_id', orgId)
					.eq('user_id', currentOwnerMembership.user_id);
				return fail(500, { error: { message: 'Transfer failed during promotion' } });
			}

			ctx.audit({
				action: 'transfer_org_ownership',
				resourceType: 'organization',
				resourceId: orgId,
				details: {
					fromUserId: currentOwnerMembership.user_id,
					toUserId: targetUserId,
					orgName: org.name
				},
				severity: 'critical'
			});

			return { success: true };
		}
	}),

	giftTier: adminAction({
		page: 'gifting',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;
			const orgId = event.params.orgId as string;
			const formData = await event.request.formData();
			const giftTier = formData.get('giftTier') as string;
			const days = parseInt(formData.get('days') as string);

			if (!giftTier || !days || days < 1) return fail(400, { error: { message: 'Missing or invalid fields' } });
			if (giftTier !== 'team' && giftTier !== 'unit') return fail(400, { error: { message: 'Invalid gift tier' } });

			const { data: org, error: orgError } = await adminClient
				.from('organizations')
				.select('id, tier, stripe_subscription_id, subscription_status')
				.eq('id', orgId)
				.single();

			if (orgError || !org) return fail(404, { error: { message: 'Organization not found' } });

			const expiresAt = new Date();
			expiresAt.setDate(expiresAt.getDate() + days);

			const { error: updateError } = await adminClient
				.from('organizations')
				.update({ gift_tier: giftTier, gift_expires_at: expiresAt.toISOString(), gifted_by: ctx.adminUser.id })
				.eq('id', orgId);

			if (updateError) return fail(500, { error: { message: 'Failed to gift tier' } });

			if (
				org.stripe_subscription_id &&
				org.subscription_status === 'active' &&
				TIER_RANK[giftTier] >= TIER_RANK[org.tier]
			) {
				try {
					await pauseSubscription(org.stripe_subscription_id);
				} catch (err) {
					console.error('[admin] Failed to pause subscription:', err);
				}
			}

			ctx.audit({
				action: 'admin.org.gift_tier',
				resourceType: 'organization',
				resourceId: orgId,
				orgId,
				details: { giftTier, days },
				severity: 'warning'
			});
			invalidateTierCache(orgId);
			return { success: true };
		}
	}),

	revokeGift: adminAction({
		page: 'gifting',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;
			const orgId = event.params.orgId as string;

			const { data: org, error: orgError } = await adminClient
				.from('organizations')
				.select('id, stripe_subscription_id, subscription_status')
				.eq('id', orgId)
				.single();

			if (orgError || !org) return fail(404, { error: { message: 'Organization not found' } });

			const { error: updateError } = await adminClient
				.from('organizations')
				.update({ gift_tier: null, gift_expires_at: null, gifted_by: null })
				.eq('id', orgId);

			if (updateError) return fail(500, { error: { message: 'Failed to revoke gift' } });

			if (org.stripe_subscription_id && org.subscription_status === 'paused') {
				try {
					await resumeSubscription(org.stripe_subscription_id);
				} catch (err) {
					console.error('[admin] Failed to resume subscription:', err);
				}
			}

			ctx.audit({
				action: 'admin.org.revoke_gift',
				resourceType: 'organization',
				resourceId: orgId,
				orgId,
				severity: 'warning'
			});
			invalidateTierCache(orgId);
			return { success: true };
		}
	}),

	extendGift: adminAction({
		page: 'gifting',
		fn: async (ctx, event) => {
			const { adminClient } = ctx;
			const orgId = event.params.orgId as string;
			const formData = await event.request.formData();
			const days = parseInt(formData.get('days') as string);

			if (!days || days < 1) return fail(400, { error: { message: 'Missing or invalid days' } });

			const { data: org, error: orgError } = await adminClient
				.from('organizations')
				.select('id, gift_tier, gift_expires_at')
				.eq('id', orgId)
				.single();

			if (orgError || !org) return fail(404, { error: { message: 'Organization not found' } });
			if (!org.gift_tier) return fail(400, { error: { message: 'Organization does not have an active gift' } });

			const currentExpiry = org.gift_expires_at ? new Date(org.gift_expires_at) : new Date();
			const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
			baseDate.setDate(baseDate.getDate() + days);

			const { error: updateError } = await adminClient
				.from('organizations')
				.update({ gift_expires_at: baseDate.toISOString() })
				.eq('id', orgId);

			if (updateError) return fail(500, { error: { message: 'Failed to extend gift' } });

			ctx.audit({
				action: 'admin.org.extend_gift',
				resourceType: 'organization',
				resourceId: orgId,
				orgId,
				details: { days },
				severity: 'info'
			});
			invalidateTierCache(orgId);
			return { success: true };
		}
	}),

	setFeatureOverride: adminAction({
		page: 'organizations',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

			const formData = await event.request.formData();
			const featureKey = formData.get('featureKey')?.toString() ?? '';
			const state = formData.get('state')?.toString() ?? '';
			const expiresAt = parseFeatureOverrideExpiry(formData.get('expiresAt')?.toString() || null);
			const reason = parseFeatureOverrideReason(formData.get('reason')?.toString() ?? null);

			if (!isPlanFeatureKey(featureKey)) return fail(400, { error: { message: 'Invalid feature key' } });
			if (state !== 'granted' && state !== 'denied') return fail(400, { error: { message: 'Invalid override state' } });
			if (expiresAt && typeof expiresAt === 'object') return fail(400, { error: { message: expiresAt.error } });
			if (reason && typeof reason === 'object') return fail(400, { error: { message: reason.error } });

			const result = await grantOrganizationPlanFeatureOverride(
				{
					store: createSupabaseDataStore(ctx.adminClient),
					audit: { log: (event) => ctx.audit(event) },
					admin: { userId: ctx.adminUser.id, role: ctx.adminUser.role }
				},
				{ orgId, featureKey, state, expiresAt, reason }
			);

			invalidateTierCache(orgId);
			return {
				success: true,
				planFeatureOverride: {
					action: 'set',
					id: result.id,
					featureKey: result.feature_key,
					state: result.override_state
				}
			};
		}
	}),

	revokeFeatureOverride: adminAction({
		page: 'organizations',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

			const formData = await event.request.formData();
			const overrideId = formData.get('overrideId')?.toString() ?? '';
			if (!overrideId) return fail(400, { error: { message: 'Missing override ID' } });
			if (!validateUUID(overrideId)) return fail(400, { error: { message: 'Invalid override ID' } });

			const result = await revokeOrganizationPlanFeatureOverride(
				{
					store: createSupabaseDataStore(ctx.adminClient),
					audit: { log: (event) => ctx.audit(event) },
					admin: { userId: ctx.adminUser.id, role: ctx.adminUser.role }
				},
				{ orgId, overrideId }
			);

			invalidateTierCache(orgId);
			return {
				success: true,
				planFeatureOverride: {
					action: 'revoke',
					id: result.id,
					featureKey: result.feature_key
				}
			};
		}
	}),

	reconcileBilling: adminAction({
		page: 'organizations',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

			const result = await reconcileOrganizationBilling({
				orgId,
				store: createSupabaseBillingReconciliationStore(ctx.adminClient),
				provider: createStripeBillingReconciliationProvider(),
				subscription: createSupabaseSubscriptionAdapter(ctx.adminClient, orgId),
				priceCatalog: configuredPriceCatalog
			});
			const diagnostics = result.diagnostics.map(sanitizeBillingReconciliationDiagnostic);

			ctx.audit({
				action: 'admin.org.billing_reconcile',
				resourceType: 'organization',
				resourceId: orgId,
				severity: result.ok ? 'info' : 'warning',
				details: {
					status: result.status,
					result: result.result,
					driftDetected: result.driftDetected,
					snapshotUpdated: result.snapshotUpdated,
					diagnostics
				}
			});

			if (!result.ok) {
				return fail(400, {
					billingReconciliation: {
						success: false,
						message: result.result,
						diagnostics
					}
				});
			}

			return {
				billingReconciliation: {
					success: true,
					status: result.status,
					message:
						result.status === 'matched' ? 'Billing already matched Stripe.' : 'Billing snapshot refreshed from Stripe.',
					diagnostics
				}
			};
		}
	})
};
