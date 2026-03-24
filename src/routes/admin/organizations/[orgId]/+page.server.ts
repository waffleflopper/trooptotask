import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { loadWithAdminContext, adminAction } from '$lib/server/adapters/adminAdapter';
import { validateUUID } from '$lib/server/validation';
import { pauseSubscription, resumeSubscription } from '$lib/server/stripe';

const TIER_RANK: Record<string, number> = { free: 1, team: 2, unit: 3 };

export const load: PageServerLoad = loadWithAdminContext({
	page: 'organizations',
	fn: async (ctx, event) => {
		const { adminClient } = ctx;
		const orgId = event.params.orgId as string;
		if (!validateUUID(orgId)) throw error(400, 'Invalid organization ID');

		const { data: org, error: orgError } = await adminClient
			.from('organizations')
			.select('id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at, demo_type')
			.eq('id', orgId)
			.single();

		if (orgError || !org) throw error(404, 'Organization not found');

		const { data: memberships } = await adminClient
			.from('organization_memberships')
			.select('user_id, role')
			.eq('organization_id', orgId)
			.order('role');

		const members = await Promise.all(
			(memberships ?? []).map(async (m) => {
				const { data: authUser } = await adminClient.auth.admin.getUserById(m.user_id);
				return {
					userId: m.user_id,
					email: authUser?.user?.email ?? '(unknown)',
					role: m.role as string
				};
			})
		);

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

		const effectiveTier = (org.gift_tier ?? org.tier ?? 'free') as string;

		return {
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
				details: { giftTier, days },
				severity: 'warning'
			});
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
				severity: 'warning'
			});
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
				details: { days },
				severity: 'info'
			});
			return { success: true };
		}
	})
};
