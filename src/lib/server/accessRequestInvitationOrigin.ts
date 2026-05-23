import type { SupabaseClient } from '@supabase/supabase-js';

type AuthUserLookup = {
	getUserById?: (userId: string) => Promise<{
		data?: { user?: { id?: string; email?: string | null } | null } | null;
		error?: unknown;
	}>;
};

type InviterProfileLookup = {
	listUserProfilesByIds?: (userIds: string[]) => Promise<Map<string, InviterProfile>>;
};

type InviterProfile = {
	firstName: string | null;
	lastName: string | null;
};

interface UserProfileRow {
	user_id: string;
	first_name: string | null;
	last_name: string | null;
}

interface OrganizationReferenceRow {
	id: string;
	name: string | null;
}

export interface AccessRequestInvitationOriginRow {
	id: string;
	organization_invitation_id: string;
	organization_id: string;
	invited_by: string;
	invited_at: string;
	intended_membership_role: string;
	intended_member_preset: string | null;
	organizations: OrganizationReferenceRow | OrganizationReferenceRow[] | null;
}

export interface AccessRequestInvitationOriginSource {
	id: string;
	access_request_organization_invitation_links?:
		| AccessRequestInvitationOriginRow
		| AccessRequestInvitationOriginRow[]
		| null;
}

export interface AccessRequestInvitationOrigin {
	link_id: string;
	invitation_id: string;
	organization_id: string;
	organization_name: string;
	inviter_user_id: string;
	inviter_email: string | null;
	inviter_label: string;
	invited_at: string;
	membership_role: 'admin' | 'member';
	membership_role_label: string;
	member_preset: string | null;
	member_preset_label: string | null;
	intended_access_label: string;
}

export const ACCESS_REQUEST_INVITATION_ORIGIN_SELECT =
	'access_request_organization_invitation_links(id, organization_invitation_id, organization_id, invited_by, invited_at, intended_membership_role, intended_member_preset, organizations(id, name))';

export async function resolveAccessRequestInvitationOrigins(
	requests: AccessRequestInvitationOriginSource[],
	authAdmin: AuthUserLookup | undefined,
	profileLookup?: InviterProfileLookup
): Promise<Record<string, AccessRequestInvitationOrigin[]>> {
	const linksByRequestId = Object.fromEntries(
		requests.map((request) => [
			request.id,
			normalizeInvitationLinks(request.access_request_organization_invitation_links)
		])
	);
	const inviterIds = Array.from(
		new Set(Object.values(linksByRequestId).flatMap((links) => links.map((link) => link.invited_by)))
	);
	const inviterEmails = await resolveInviterEmails(inviterIds, authAdmin);
	const inviterProfiles = await resolveInviterProfiles(inviterIds, profileLookup);

	return Object.fromEntries(
		Object.entries(linksByRequestId).map(([requestId, links]) => [
			requestId,
			links.map((link) =>
				shapeInvitationOrigin(
					link,
					inviterEmails.get(link.invited_by) ?? null,
					inviterProfiles.get(link.invited_by) ?? null
				)
			)
		])
	);
}

export async function listSupabaseInviterProfiles(
	client: SupabaseClient,
	userIds: string[]
): Promise<Map<string, InviterProfile>> {
	if (userIds.length === 0) return new Map();

	const { data, error } = await client
		.from('user_profiles')
		.select('user_id, first_name, last_name')
		.in('user_id', userIds);

	if (error) throw error;

	return new Map(
		((data ?? []) as UserProfileRow[]).map((profile) => [
			profile.user_id,
			{
				firstName: profile.first_name,
				lastName: profile.last_name
			}
		])
	);
}

function normalizeInvitationLinks(
	links: AccessRequestInvitationOriginSource['access_request_organization_invitation_links']
): AccessRequestInvitationOriginRow[] {
	if (!links) return [];
	const normalized = Array.isArray(links) ? links : [links];
	return normalized.sort((a, b) => new Date(b.invited_at).getTime() - new Date(a.invited_at).getTime());
}

async function resolveInviterEmails(
	inviterIds: string[],
	authAdmin: AuthUserLookup | undefined
): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	const getUserById = authAdmin?.getUserById;
	if (!getUserById || inviterIds.length === 0) return result;

	await Promise.all(
		inviterIds.map(async (inviterId) => {
			try {
				const { data, error } = await getUserById(inviterId);
				const email = error ? null : data?.user?.email;
				if (email) result.set(inviterId, email);
			} catch {
				// Inviter email is useful review context, but the request should still render if auth lookup fails.
			}
		})
	);

	return result;
}

async function resolveInviterProfiles(
	inviterIds: string[],
	profileLookup: InviterProfileLookup | undefined
): Promise<Map<string, InviterProfile>> {
	if (!profileLookup?.listUserProfilesByIds || inviterIds.length === 0) return new Map();

	try {
		return await profileLookup.listUserProfilesByIds(inviterIds);
	} catch {
		return new Map();
	}
}

function shapeInvitationOrigin(
	link: AccessRequestInvitationOriginRow,
	inviterEmail: string | null,
	inviterProfile: InviterProfile | null
) {
	const organization = Array.isArray(link.organizations) ? link.organizations[0] : link.organizations;
	const membershipRole = link.intended_membership_role === 'admin' ? 'admin' : 'member';
	const memberPresetLabel = membershipRole === 'member' ? formatMemberPreset(link.intended_member_preset) : null;
	const inviterProfileLabel = formatInviterProfileLabel(inviterProfile);

	return {
		link_id: link.id,
		invitation_id: link.organization_invitation_id,
		organization_id: link.organization_id,
		organization_name: organization?.name ?? 'Unknown organization',
		inviter_user_id: link.invited_by,
		inviter_email: inviterEmail,
		inviter_label: inviterProfileLabel ?? inviterEmail ?? 'Unknown inviter',
		invited_at: link.invited_at,
		membership_role: membershipRole,
		membership_role_label: membershipRole === 'admin' ? 'Admin' : 'Member',
		member_preset: membershipRole === 'member' ? link.intended_member_preset : null,
		member_preset_label: memberPresetLabel,
		intended_access_label:
			membershipRole === 'admin' ? 'Membership Role: Admin' : `Member preset: ${memberPresetLabel ?? 'Unknown'}`
	} satisfies AccessRequestInvitationOrigin;
}

function formatInviterProfileLabel(profile: InviterProfile | null): string | null {
	if (!profile) return null;
	const fullName = [profile.firstName, profile.lastName]
		.map((part) => part?.trim() ?? '')
		.filter(Boolean)
		.join(' ');
	return fullName || null;
}

function formatMemberPreset(preset: string | null): string | null {
	if (preset === 'editor') return 'Editor';
	if (preset === 'operator') return 'Operator';
	if (preset === 'viewer') return 'Viewer';
	if (!preset) return null;
	return preset;
}
