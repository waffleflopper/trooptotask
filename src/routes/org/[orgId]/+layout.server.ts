import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { OrganizationMemberPermissions } from '$lib/types';
import {
	ensureUserSubscription,
	countUserOrganizations,
	countOrganizationPersonnel,
	computeSubscriptionLimits
} from '$lib/server/subscription';
import { getSupabaseClient } from '$lib/server/supabase';

export const load: LayoutServerLoad = async ({ params, locals, cookies }) => {
	const user = locals.user;
	const { orgId } = params;

	// Check for demo mode
	const demoMode = cookies.get('demo_mode');
	const demoSandboxCookie = cookies.get('demo_sandbox');
	const isDemoReadOnly = demoMode === 'readonly';

	// Get appropriate supabase client (service role for demo mode)
	const supabase = getSupabaseClient(locals, cookies);

	// Get organization info (including demo_type)
	const { data: org } = await supabase
		.from('organizations')
		.select('id, name, demo_type')
		.eq('id', orgId)
		.single();

	if (!org) {
		throw error(404, 'Organization not found');
	}

	// Handle demo showcase access (no login required for read-only viewing)
	if (org.demo_type === 'showcase' && isDemoReadOnly) {
		// Allow anonymous read-only access to showcase org
		const readOnlyPermissions: OrganizationMemberPermissions = {
			canViewCalendar: true,
			canEditCalendar: false,
			canViewPersonnel: true,
			canEditPersonnel: false,
			canViewTraining: true,
			canEditTraining: false,
			canManageMembers: false
		};

		return {
			orgId,
			orgName: org.name,
			userRole: 'member' as const,
			userId: null,
			permissions: readOnlyPermissions,
			allOrgs: [],
			subscriptionLimits: null,
			isDemoReadOnly: true,
			isDemoSandbox: false
		};
	}

	// Handle demo sandbox access (no login required, full access to sandbox)
	if (org.demo_type === 'sandbox' && demoSandboxCookie) {
		try {
			const sandboxInfo = JSON.parse(demoSandboxCookie);
			if (sandboxInfo.orgId === orgId) {
				// This is the user's sandbox - give them full access
				const fullPermissions: OrganizationMemberPermissions = {
					canViewCalendar: true,
					canEditCalendar: true,
					canViewPersonnel: true,
					canEditPersonnel: true,
					canViewTraining: true,
					canEditTraining: true,
					canManageMembers: true
				};

				return {
					orgId,
					orgName: org.name,
					userRole: 'owner' as const,
					userId: null,
					permissions: fullPermissions,
					allOrgs: [],
					subscriptionLimits: null,
					isDemoReadOnly: false,
					isDemoSandbox: true
				};
			}
		} catch {
			// Invalid cookie, ignore
		}
	}

	// For non-demo access, require login
	if (!user) throw redirect(303, '/auth/login');

	// Verify membership and get permissions
	const { data: membership } = await locals.supabase
		.from('organization_memberships')
		.select(
			'role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_manage_members'
		)
		.eq('organization_id', orgId)
		.eq('user_id', user.id)
		.single();

	if (!membership) {
		throw error(403, 'You are not a member of this organization');
	}

	if (!org) {
		throw error(404, 'Organization not found');
	}

	// Get all organizations the user belongs to (for the org switcher)
	const { data: memberships } = await locals.supabase
		.from('organization_memberships')
		.select('organization_id, role, organizations(id, name)')
		.eq('user_id', user.id);

	const allOrgs = (memberships ?? [])
		.filter((m: any) => m.organizations)
		.map((m: any) => ({
			id: m.organizations.id,
			name: m.organizations.name,
			role: m.role
		}));

	const isOwner = membership.role === 'owner';

	// Build permissions object - owners always have full access
	const permissions: OrganizationMemberPermissions = {
		canViewCalendar: isOwner || membership.can_view_calendar,
		canEditCalendar: isOwner || membership.can_edit_calendar,
		canViewPersonnel: isOwner || membership.can_view_personnel,
		canEditPersonnel: isOwner || membership.can_edit_personnel,
		canViewTraining: isOwner || membership.can_view_training,
		canEditTraining: isOwner || membership.can_edit_training,
		canManageMembers: isOwner || membership.can_manage_members
	};

	// Get organization owner's subscription for feature limits
	const { data: ownerMembership } = await locals.supabase
		.from('organization_memberships')
		.select('user_id')
		.eq('organization_id', orgId)
		.eq('role', 'owner')
		.single();

	let subscriptionLimits = null;
	if (ownerMembership) {
		const { subscription, plan } = await ensureUserSubscription(locals.supabase, ownerMembership.user_id);
		const orgCount = await countUserOrganizations(locals.supabase, ownerMembership.user_id);
		const personnelCount = await countOrganizationPersonnel(locals.supabase, orgId);
		const limits = computeSubscriptionLimits(subscription, plan, orgCount);

		subscriptionLimits = {
			...limits,
			currentPersonnel: personnelCount,
			canAddPersonnel: limits.maxPersonnelPerOrg === null || personnelCount < limits.maxPersonnelPerOrg,
			planId: plan.id,
			planName: plan.name
		};
	}

	return {
		orgId,
		orgName: org.name,
		userRole: membership.role as 'owner' | 'member',
		userId: user.id,
		permissions,
		allOrgs,
		subscriptionLimits,
		isDemoReadOnly: false,
		isDemoSandbox: false
	};
};
