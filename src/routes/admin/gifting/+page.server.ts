import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformGifting } from '$lib/server/adapters/supabasePlatformGifting';
import { isPlatformGiftTier } from '$lib/server/core/useCases/platformGifting';
import type { Tier } from '$lib/types/subscription';
import { createSupabasePlatformMetrics } from '$lib/server/adapters/supabasePlatformMetrics';
import { displayOwnerMembership } from '$lib/server/core/useCases/platformMetrics';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'gifting',
	fn: async (ctx, event) => {
		const search = event.url.searchParams.get('search') || '';
		const allOrgs = await createSupabasePlatformGifting(ctx).listOrganizations();

		const orgIds = allOrgs.map((org) => org.id);
		const platformMetrics = createSupabasePlatformMetrics(ctx);
		const [personnelCounts, ownerMemberships] = await Promise.all([
			platformMetrics.countActivePersonnelByOrganization(orgIds),
			platformMetrics.getOwnerMembershipsByOrganization(orgIds)
		]);

		let organizations = allOrgs.map((org) => ({
			id: org.id,
			name: org.name,
			ownerEmail: displayOwnerMembership(ownerMemberships.get(org.id)),
			tier: org.tier,
			giftTier: org.giftTier as Tier | null,
			giftExpiresAt: org.giftExpiresAt,
			giftedBy: org.giftedBy,
			personnelCount: personnelCounts.get(org.id) ?? 0,
			hasActiveSubscription: !!org.stripeSubscriptionId && org.subscriptionStatus === 'active',
			subscriptionStatus: org.subscriptionStatus,
			stripeSubscriptionId: org.stripeSubscriptionId
		}));

		if (search) {
			const lowerSearch = search.toLowerCase();
			organizations = organizations.filter(
				(o) => o.name.toLowerCase().includes(lowerSearch) || o.ownerEmail.toLowerCase().includes(lowerSearch)
			);
		}

		return { organizations, search };
	}
});

export const actions: Actions = {
	giftTier: adminAction({
		page: 'gifting',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const orgId = formData.get('orgId') as string;
			const giftTier = formData.get('giftTier') as string;
			const days = parseInt(formData.get('days') as string);

			if (!orgId || !giftTier || !days || days < 1) {
				return fail(400, { error: 'Missing or invalid fields' });
			}

			if (!isPlatformGiftTier(giftTier)) {
				return fail(400, { error: 'Invalid gift tier' });
			}

			try {
				const result = await createSupabasePlatformGifting(ctx).grantGift({ orgId, giftTier, days });
				if (result.status === 'not_found') return fail(404, { error: 'Organization not found' });
			} catch (error) {
				console.error('[admin/gifting] Failed to gift tier:', error);
				return fail(500, { error: 'Failed to gift tier' });
			}

			return { success: true, action: 'gift' };
		}
	}),

	revokeGift: adminAction({
		page: 'gifting',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const orgId = formData.get('orgId') as string;

			if (!orgId) return fail(400, { error: 'Missing org ID' });

			try {
				const result = await createSupabasePlatformGifting(ctx).revokeGift(orgId);
				if (result.status === 'not_found') return fail(404, { error: 'Organization not found' });
			} catch (error) {
				console.error('[admin/gifting] Failed to revoke gift:', error);
				return fail(500, { error: 'Failed to revoke gift' });
			}

			return { success: true, action: 'revoke' };
		}
	}),

	extendGift: adminAction({
		page: 'gifting',
		fn: async (ctx, event) => {
			const formData = await event.request.formData();
			const orgId = formData.get('orgId') as string;
			const days = parseInt(formData.get('days') as string);

			if (!orgId || !days || days < 1) {
				return fail(400, { error: 'Missing or invalid fields' });
			}

			try {
				const result = await createSupabasePlatformGifting(ctx).extendGift({ orgId, days });
				if (result.status === 'not_found') return fail(404, { error: 'Organization not found' });
				if (result.status === 'no_active_gift') {
					return fail(400, { error: 'Organization does not have an active gift' });
				}
			} catch (error) {
				console.error('[admin/gifting] Failed to extend gift:', error);
				return fail(500, { error: 'Failed to extend gift' });
			}

			return { success: true, action: 'extend' };
		}
	})
};
