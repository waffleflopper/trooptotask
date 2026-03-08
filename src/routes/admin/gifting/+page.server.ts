import { fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAdminClient } from '$lib/server/supabase';
import { pauseSubscription, resumeSubscription } from '$lib/server/stripe';
import type { Tier } from '$lib/types/subscription';

const TIER_RANK: Record<string, number> = { free: 1, team: 2, unit: 3 };

interface OrgRow {
	id: string;
	name: string;
	created_by: string;
	tier: Tier;
	gift_tier: string | null;
	gift_expires_at: string | null;
	gifted_by: string | null;
	stripe_subscription_id: string | null;
	subscription_status: string | null;
	stripe_customer_id: string | null;
	demo_type: string | null;
}

export const load: PageServerLoad = async ({ url }) => {
	const adminClient = getAdminClient();
	const search = url.searchParams.get('search') || '';

	// Fetch all non-demo organizations
	const { data: orgs, error: orgsError } = await adminClient
		.from('organizations')
		.select(
			'id, name, created_by, tier, gift_tier, gift_expires_at, gifted_by, stripe_subscription_id, subscription_status, stripe_customer_id, demo_type'
		)
		.is('demo_type', null)
		.order('name');

	if (orgsError) {
		console.error('[admin/gifting] Failed to fetch organizations:', orgsError);
		return { organizations: [], search };
	}

	const allOrgs = (orgs ?? []) as OrgRow[];

	// Get owner emails via auth admin API
	const ownerIds = [...new Set(allOrgs.map((o) => o.created_by))];
	const { data: authResult } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
	const emailMap: Record<string, string> = {};
	(authResult?.users ?? []).forEach((u) => {
		emailMap[u.id] = u.email || 'Unknown';
	});

	// Get personnel counts for all orgs
	const personnelCounts: Record<string, number> = {};
	for (const org of allOrgs) {
		const { data: countResult } = await adminClient.rpc('count_org_personnel', {
			p_org_id: org.id
		});
		personnelCounts[org.id] = countResult ?? 0;
	}

	let organizations = allOrgs.map((org) => ({
		id: org.id,
		name: org.name,
		ownerEmail: emailMap[org.created_by] || 'Unknown',
		tier: org.tier as Tier,
		giftTier: org.gift_tier as Tier | null,
		giftExpiresAt: org.gift_expires_at,
		giftedBy: org.gifted_by,
		personnelCount: personnelCounts[org.id] || 0,
		hasActiveSubscription:
			!!org.stripe_subscription_id && org.subscription_status === 'active',
		subscriptionStatus: org.subscription_status,
		stripeSubscriptionId: org.stripe_subscription_id
	}));

	// Apply search filter
	if (search) {
		const lowerSearch = search.toLowerCase();
		organizations = organizations.filter(
			(o) =>
				o.name.toLowerCase().includes(lowerSearch) ||
				o.ownerEmail.toLowerCase().includes(lowerSearch)
		);
	}

	return { organizations, search };
};

export const actions: Actions = {
	giftTier: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const orgId = formData.get('orgId') as string;
		const giftTier = formData.get('giftTier') as string;
		const days = parseInt(formData.get('days') as string);

		if (!orgId || !giftTier || !days || days < 1) {
			return fail(400, { error: 'Missing or invalid fields' });
		}

		if (giftTier !== 'team' && giftTier !== 'unit') {
			return fail(400, { error: 'Invalid gift tier' });
		}

		const adminClient = getAdminClient();

		// Get the org to check subscription state
		const { data: org, error: orgError } = await adminClient
			.from('organizations')
			.select('id, tier, stripe_subscription_id, subscription_status')
			.eq('id', orgId)
			.single();

		if (orgError || !org) {
			return fail(404, { error: 'Organization not found' });
		}

		const expiresAt = new Date();
		expiresAt.setDate(expiresAt.getDate() + days);

		// Update org with gift
		const { error: updateError } = await adminClient
			.from('organizations')
			.update({
				gift_tier: giftTier,
				gift_expires_at: expiresAt.toISOString(),
				gifted_by: user.id
			})
			.eq('id', orgId);

		if (updateError) {
			console.error('[admin/gifting] Failed to gift tier:', updateError);
			return fail(500, { error: 'Failed to gift tier' });
		}

		// Pause Stripe subscription if gift tier >= sub tier and sub is active
		if (
			org.stripe_subscription_id &&
			org.subscription_status === 'active' &&
			TIER_RANK[giftTier] >= TIER_RANK[org.tier]
		) {
			try {
				await pauseSubscription(org.stripe_subscription_id);
			} catch (err) {
				console.error('[admin/gifting] Failed to pause subscription:', err);
				// Gift was applied, just log the pause failure
			}
		}

		return { success: true, action: 'gift' };
	},

	revokeGift: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const orgId = formData.get('orgId') as string;

		if (!orgId) return fail(400, { error: 'Missing org ID' });

		const adminClient = getAdminClient();

		// Get the org to check if we need to resume subscription
		const { data: org, error: orgError } = await adminClient
			.from('organizations')
			.select('id, stripe_subscription_id, subscription_status')
			.eq('id', orgId)
			.single();

		if (orgError || !org) {
			return fail(404, { error: 'Organization not found' });
		}

		// Clear gift fields
		const { error: updateError } = await adminClient
			.from('organizations')
			.update({
				gift_tier: null,
				gift_expires_at: null,
				gifted_by: null
			})
			.eq('id', orgId);

		if (updateError) {
			console.error('[admin/gifting] Failed to revoke gift:', updateError);
			return fail(500, { error: 'Failed to revoke gift' });
		}

		// Resume Stripe subscription if it was paused
		if (org.stripe_subscription_id && org.subscription_status === 'paused') {
			try {
				await resumeSubscription(org.stripe_subscription_id);
			} catch (err) {
				console.error('[admin/gifting] Failed to resume subscription:', err);
			}
		}

		return { success: true, action: 'revoke' };
	},

	extendGift: async ({ request, locals }) => {
		const user = locals.user;
		if (!user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const orgId = formData.get('orgId') as string;
		const days = parseInt(formData.get('days') as string);

		if (!orgId || !days || days < 1) {
			return fail(400, { error: 'Missing or invalid fields' });
		}

		const adminClient = getAdminClient();

		// Get the org's current gift expiry
		const { data: org, error: orgError } = await adminClient
			.from('organizations')
			.select('id, gift_tier, gift_expires_at')
			.eq('id', orgId)
			.single();

		if (orgError || !org) {
			return fail(404, { error: 'Organization not found' });
		}

		if (!org.gift_tier) {
			return fail(400, { error: 'Organization does not have an active gift' });
		}

		// Extend from current expiry or from now if already expired
		const currentExpiry = org.gift_expires_at ? new Date(org.gift_expires_at) : new Date();
		const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
		baseDate.setDate(baseDate.getDate() + days);

		const { error: updateError } = await adminClient
			.from('organizations')
			.update({
				gift_expires_at: baseDate.toISOString()
			})
			.eq('id', orgId);

		if (updateError) {
			console.error('[admin/gifting] Failed to extend gift:', updateError);
			return fail(500, { error: 'Failed to extend gift' });
		}

		return { success: true, action: 'extend' };
	}
};
