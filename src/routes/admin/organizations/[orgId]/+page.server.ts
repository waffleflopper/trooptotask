import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAdminRole, canAccessPage } from '$lib/server/admin';
import { getAdminClient } from '$lib/server/supabase';
import { auditLog, getRequestInfo } from '$lib/server/auditLog';
import { validateUUID } from '$lib/server/validation';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { user, supabase } = locals;
	if (!user) throw error(401, 'Not authenticated');

	const role = await getAdminRole(supabase, user.id);
	if (!role || !canAccessPage(role, 'organizations')) throw error(403, 'Not authorized');

	const { orgId } = params;
	if (!validateUUID(orgId)) throw error(400, 'Invalid organization ID');

	const adminClient = getAdminClient();

	// Fetch org record
	const { data: org, error: orgError } = await adminClient
		.from('organizations')
		.select('id, name, subscription_tier, gift_tier, gift_expires_at, suspended_at, created_at, demo_type')
		.eq('id', orgId)
		.single();

	if (orgError || !org) throw error(404, 'Organization not found');

	// Fetch members with roles
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

	// Active personnel count (excluding archived)
	const { count: personnelCount } = await adminClient
		.from('personnel')
		.select('*', { count: 'exact', head: true })
		.eq('organization_id', orgId)
		.is('archived_at', null);

	// Last 10 audit events for this org
	const { data: auditEvents } = await adminClient
		.from('audit_logs')
		.select('id, action, user_id, timestamp, severity, resource_type, resource_id')
		.eq('org_id', orgId)
		.order('timestamp', { ascending: false })
		.limit(10);

	const effectiveTier = (org.gift_tier ?? org.subscription_tier ?? 'free') as string;

	return {
		org: {
			id: org.id,
			name: org.name,
			subscriptionTier: org.subscription_tier as string,
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
};

export const actions: Actions = {
	transferOwnership: async (event) => {
		const { locals, params, request } = event;
		const { user, supabase } = locals;
		if (!user) return fail(401, { error: { message: 'Not authenticated' } });

		const role = await getAdminRole(supabase, user.id);
		if (role !== 'super_admin') return fail(403, { error: { message: 'Only super admins can transfer ownership' } });

		const { orgId } = params;
		if (!validateUUID(orgId)) return fail(400, { error: { message: 'Invalid organization ID' } });

		const formData = await request.formData();
		const targetUserId = formData.get('targetUserId')?.toString() ?? '';
		const confirmName = formData.get('confirmName')?.toString() ?? '';

		if (!validateUUID(targetUserId)) return fail(400, { error: { message: 'Invalid target user ID' } });

		const adminClient = getAdminClient();

		// Fetch org to verify the name confirmation
		const { data: org } = await adminClient
			.from('organizations')
			.select('id, name')
			.eq('id', orgId)
			.single();

		if (!org) return fail(404, { error: { message: 'Organization not found' } });
		if (confirmName !== org.name) return fail(400, { error: { message: 'Organization name does not match' } });

		// Verify target is a member of the org
		const { data: targetMembership } = await adminClient
			.from('organization_memberships')
			.select('user_id, role')
			.eq('organization_id', orgId)
			.eq('user_id', targetUserId)
			.single();

		if (!targetMembership) return fail(400, { error: { message: 'Target user is not a member of this organization' } });
		if (targetMembership.role === 'owner') return fail(400, { error: { message: 'Target user is already the owner' } });

		// Find current owner
		const { data: currentOwnerMembership } = await adminClient
			.from('organization_memberships')
			.select('user_id')
			.eq('organization_id', orgId)
			.eq('role', 'owner')
			.single();

		if (!currentOwnerMembership) return fail(500, { error: { message: 'Could not find current owner' } });

		// Demote current owner to admin
		const { error: demoteError } = await adminClient
			.from('organization_memberships')
			.update({ role: 'admin' })
			.eq('organization_id', orgId)
			.eq('user_id', currentOwnerMembership.user_id);

		if (demoteError) return fail(500, { error: { message: 'Transfer failed during demotion' } });

		// Promote target to owner
		const { error: promoteError } = await adminClient
			.from('organization_memberships')
			.update({ role: 'owner' })
			.eq('organization_id', orgId)
			.eq('user_id', targetUserId);

		if (promoteError) {
			// Attempt to rollback the demotion
			await adminClient
				.from('organization_memberships')
				.update({ role: 'owner' })
				.eq('organization_id', orgId)
				.eq('user_id', currentOwnerMembership.user_id);
			return fail(500, { error: { message: 'Transfer failed during promotion' } });
		}

		await auditLog(
			{
				action: 'transfer_org_ownership',
				resourceType: 'organization',
				resourceId: orgId,
				orgId,
				details: {
					fromUserId: currentOwnerMembership.user_id,
					toUserId: targetUserId,
					orgName: org.name
				},
				severity: 'critical'
			},
			getRequestInfo(event)
		);

		return { success: true };
	}
};
