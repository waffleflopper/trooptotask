import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import type { OrganizationMemberPermissions } from '$lib/types';
import { getSupabaseClient } from '$lib/server/supabase';
import {
	transformPersonnel,
	transformGroups,
	transformStatusTypes,
	transformTrainingTypes,
	transformPersonnelTrainings
} from '$lib/server/transforms';

async function fetchSharedData(supabase: any, orgId: string) {
	const [personnelRes, groupsRes, statusTypesRes, trainingTypesRes, personnelTrainingsRes, activeOnboardingsRes] =
		await Promise.all([
			supabase
				.from('personnel')
				.select('*, groups(name)')
				.eq('organization_id', orgId)
				.order('last_name'),
			supabase.from('groups').select('*').eq('organization_id', orgId).order('sort_order'),
			supabase.from('status_types').select('*').eq('organization_id', orgId).order('sort_order'),
			supabase
				.from('training_types')
				.select('*')
				.eq('organization_id', orgId)
				.order('sort_order'),
			supabase.from('personnel_trainings').select('*').eq('organization_id', orgId),
			supabase
				.from('personnel_onboardings')
				.select('personnel_id')
				.eq('organization_id', orgId)
				.eq('status', 'in_progress')
		]);

	return {
		personnel: transformPersonnel(personnelRes.data ?? []),
		groups: transformGroups(groupsRes.data ?? []),
		statusTypes: transformStatusTypes(statusTypesRes.data ?? []),
		trainingTypes: transformTrainingTypes(trainingTypesRes.data ?? []),
		personnelTrainings: transformPersonnelTrainings(personnelTrainingsRes.data ?? []),
		activeOnboardingPersonnelIds: (activeOnboardingsRes.data ?? []).map((r: any) => r.personnel_id) as string[]
	};
}

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:shared-data');

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
		const readOnlyPermissions: OrganizationMemberPermissions = {
			canViewCalendar: true,
			canEditCalendar: false,
			canViewPersonnel: true,
			canEditPersonnel: false,
			canViewTraining: true,
			canEditTraining: false,
			canManageMembers: false
		};

		const shared = await fetchSharedData(supabase, orgId);

		return {
			orgId,
			orgName: org.name,
			userRole: 'member' as const,
			userId: null,
			permissions: readOnlyPermissions,
			allOrgs: [],

			isDemoReadOnly: true,
			isDemoSandbox: false,
			...shared
		};
	}

	// Handle demo sandbox access (no login required, full access to sandbox)
	if (org.demo_type === 'sandbox' && demoSandboxCookie) {
		try {
			const sandboxInfo = JSON.parse(demoSandboxCookie);
			if (sandboxInfo.orgId === orgId) {
				const fullPermissions: OrganizationMemberPermissions = {
					canViewCalendar: true,
					canEditCalendar: true,
					canViewPersonnel: true,
					canEditPersonnel: true,
					canViewTraining: true,
					canEditTraining: true,
					canManageMembers: true
				};

				const shared = await fetchSharedData(supabase, orgId);

				return {
					orgId,
					orgName: org.name,
					userRole: 'owner' as const,
					userId: null,
					permissions: fullPermissions,
					allOrgs: [],
		
					isDemoReadOnly: false,
					isDemoSandbox: true,
					...shared
				};
			}
		} catch {
			// Invalid cookie, ignore
		}
	}

	// For non-demo access, require login
	if (!user) throw redirect(303, '/auth/login');

	// Parallelize: membership check, allOrgs, ownerMembership, and shared entity data
	const [membershipRes, membershipsRes, shared] = await Promise.all([
		locals.supabase
			.from('organization_memberships')
			.select(
				'role, can_view_calendar, can_edit_calendar, can_view_personnel, can_edit_personnel, can_view_training, can_edit_training, can_manage_members'
			)
			.eq('organization_id', orgId)
			.eq('user_id', user.id)
			.single(),
		locals.supabase
			.from('organization_memberships')
			.select('organization_id, role, organizations(id, name)')
			.eq('user_id', user.id),
		fetchSharedData(supabase, orgId)
	]);

	const membership = membershipRes.data;
	if (!membership) {
		throw error(403, 'You are not a member of this organization');
	}

	const allOrgs = (membershipsRes.data ?? [])
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

	return {
		orgId,
		orgName: org.name,
		userRole: membership.role as 'owner' | 'member',
		userId: user.id,
		permissions,
		allOrgs,
		isDemoReadOnly: false,
		isDemoSandbox: false,
		...shared
	};
};
