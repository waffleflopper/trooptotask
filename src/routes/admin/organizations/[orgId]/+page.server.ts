import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { validateUUID } from '$lib/server/validation';
import { createStripeBillingReconciliationProvider } from '$lib/server/stripe';
import { invalidateTierCache } from '$lib/server/subscription';
import { reconcileOrganizationBilling } from '$lib/server/core/useCases/billingReconciliation';
import { getConfiguredPriceCatalog } from '$lib/server/billing/priceCatalog';
import { createSupabaseBillingReconciliationStore } from '$lib/server/adapters/supabaseBillingReconciliation';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createSupabaseSubscriptionAdapter } from '$lib/server/adapters/supabaseSubscription';
import { createSupabasePlatformMembershipAdministration } from '$lib/server/adapters/supabasePlatformMembershipAdministration';
import {
	grantOrganizationPlanFeatureOverride,
	revokeOrganizationPlanFeatureOverride
} from '$lib/server/core/useCases/planFeatureOverrides';
import { isPlanFeatureKey } from '$lib/server/core/useCases/planPolicy';
import { createSupabasePlatformGifting } from '$lib/server/adapters/supabasePlatformGifting';
import { createSupabasePlatformOrganizationDetail } from '$lib/server/adapters/supabasePlatformOrganizationDetail';
import { isPlatformGiftTier } from '$lib/server/core/useCases/platformGifting';

function sanitizeBillingReconciliationDiagnostic(value: unknown): string {
	const message = value instanceof Error ? value.message : String(value ?? 'unknown_error');
	return message
		.replace(/[sr]k_(live|test)_[A-Za-z0-9_]+/g, '[redacted_stripe_key]')
		.replace(/whsec_\S+/g, '[redacted_webhook_secret]')
		.replace(
			/stripe-signature\s*[:=]\s*\S+?([.,;:!?)])?(?=\s|$)/gi,
			(_match, punctuation: string | undefined) => `stripe-signature=[redacted]${punctuation ?? ''}`
		)
		.replace(/bearer\s+\S+/gi, 'bearer [redacted]');
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

export const load: PageServerLoad = loadWithAdminContext({
	page: 'organizations',
	fn: async (ctx, event) => {
		const orgId = event.params.orgId as string;
		if (!validateUUID(orgId)) throw error(400, 'Invalid organization ID');

		const result = await createSupabasePlatformOrganizationDetail(ctx).getOrganizationDetail(orgId);
		if (result.status === 'not_found') throw error(404, 'Organization not found');
		if (result.status === 'provider_error') throw error(500, 'Failed to load organization detail');

		return result.detail;
	}
});

export const actions: Actions = {
	makeAdmin: adminAction({
		page: 'organizations',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

			const formData = await event.request.formData();
			const targetUserId = formData.get('targetUserId')?.toString() ?? '';
			if (!validateUUID(targetUserId)) return fail(400, { error: { message: 'Invalid target user ID' } });

			try {
				const result = await createSupabasePlatformMembershipAdministration(ctx).makeAdmin({ orgId, targetUserId });

				switch (result.status) {
					case 'updated':
						return { success: true };
					case 'target_not_member':
						return fail(400, { error: { message: 'Target user is not a member of this organization' } });
					case 'already_admin':
						return fail(400, { error: { message: 'Target user is already an admin' } });
					case 'already_owner':
						return fail(400, { error: { message: 'Target user is already the owner' } });
				}
			} catch {
				return fail(500, { error: { message: 'Failed to update membership' } });
			}
		}
	}),

	transferOwnership: adminAction({
		page: 'organizations',
		requiredRole: 'super_admin',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

			const formData = await event.request.formData();
			const targetUserId = formData.get('targetUserId')?.toString() ?? '';
			const confirmName = formData.get('confirmName')?.toString() ?? '';

			if (!validateUUID(targetUserId)) return fail(400, { error: { message: 'Invalid target user ID' } });

			try {
				const result = await createSupabasePlatformMembershipAdministration(ctx).transferOwnership({
					orgId,
					targetUserId,
					confirmName
				});

				switch (result.status) {
					case 'updated':
						return { success: true };
					case 'organization_not_found':
						return fail(404, { error: { message: 'Organization not found' } });
					case 'name_mismatch':
						return fail(400, { error: { message: 'Organization name does not match' } });
					case 'target_not_member':
						return fail(400, { error: { message: 'Target user is not a member of this organization' } });
					case 'already_owner':
						return fail(400, { error: { message: 'Target user is already the owner' } });
					case 'no_current_owner':
						return fail(500, { error: { message: 'Could not find current owner' } });
					case 'current_owner_lookup_failed':
						return fail(500, { error: { message: 'Could not verify current owner' } });
					case 'demotion_failed':
						return fail(500, { error: { message: 'Transfer failed during demotion' } });
					case 'promotion_failed':
						return fail(500, { error: { message: 'Transfer failed during promotion' } });
					case 'rollback_failed':
						return fail(500, {
							error: { message: 'Transfer failed during promotion; original owner could not be restored automatically' }
						});
				}
			} catch {
				return fail(500, { error: { message: 'Transfer failed' } });
			}
		}
	}),

	giftTier: adminAction({
		page: 'gifting',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			const formData = await event.request.formData();
			const giftTier = formData.get('giftTier') as string;
			const days = parseInt(formData.get('days') as string);

			if (!giftTier || !days || days < 1) return fail(400, { error: { message: 'Missing or invalid fields' } });
			if (!isPlatformGiftTier(giftTier)) return fail(400, { error: { message: 'Invalid gift tier' } });

			try {
				const result = await createSupabasePlatformGifting(ctx).grantGift({ orgId, giftTier, days });
				if (result.status === 'not_found') return fail(404, { error: { message: 'Organization not found' } });
				if (result.status === 'tier_below_current') {
					return fail(400, { error: { message: "Gift tier cannot be below the organization's current tier" } });
				}
			} catch {
				return fail(500, { error: { message: 'Failed to gift tier' } });
			}

			return { success: true };
		}
	}),

	revokeGift: adminAction({
		page: 'gifting',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;

			try {
				const result = await createSupabasePlatformGifting(ctx).revokeGift(orgId);
				if (result.status === 'not_found') return fail(404, { error: { message: 'Organization not found' } });
				if (result.status === 'no_active_gift') {
					return fail(400, { error: { message: 'Organization does not have an active gift' } });
				}
			} catch {
				return fail(500, { error: { message: 'Failed to revoke gift' } });
			}

			return { success: true };
		}
	}),

	extendGift: adminAction({
		page: 'gifting',
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			const formData = await event.request.formData();
			const days = parseInt(formData.get('days') as string);

			if (!days || days < 1) return fail(400, { error: { message: 'Missing or invalid days' } });

			try {
				const result = await createSupabasePlatformGifting(ctx).extendGift({ orgId, days });
				if (result.status === 'not_found') return fail(404, { error: { message: 'Organization not found' } });
				if (result.status === 'no_active_gift') {
					return fail(400, { error: { message: 'Organization does not have an active gift' } });
				}
			} catch {
				return fail(500, { error: { message: 'Failed to extend gift' } });
			}

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
		requiredRole: ['super_admin', 'support'],
		fn: async (ctx, event) => {
			const orgId = event.params.orgId as string;
			if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

			const result = await reconcileOrganizationBilling({
				orgId,
				store: createSupabaseBillingReconciliationStore(ctx.adminClient),
				provider: createStripeBillingReconciliationProvider(),
				subscription: createSupabaseSubscriptionAdapter(ctx.adminClient, orgId),
				priceCatalog: getConfiguredPriceCatalog()
			});
			const diagnostics = result.diagnostics.map(sanitizeBillingReconciliationDiagnostic);
			const safeResult = sanitizeBillingReconciliationDiagnostic(result.result);

			ctx.audit({
				action: 'admin.org.billing_reconcile',
				resourceType: 'organization',
				resourceId: orgId,
				severity: result.ok ? 'info' : 'warning',
				details: {
					status: result.status,
					result: safeResult,
					driftDetected: result.driftDetected,
					snapshotUpdated: result.snapshotUpdated,
					diagnostics
				}
			});

			if (!result.ok) {
				return fail(400, {
					billingReconciliation: {
						success: false,
						message: safeResult,
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
