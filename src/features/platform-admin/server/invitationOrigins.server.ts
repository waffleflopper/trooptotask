import type {
	IdentityPlatformAccessRequestStore,
	IdentityPlatformSupportReader,
	IdentitySupportUserLabel
} from '$features/identity/contracts';
import type {
	OrganizationPlatformInvitationReader,
	OrganizationSupportInvitationOriginFact
} from '$features/organization/contracts';
import type { PlatformAccessRequestAdminRow } from '../accessRequestTypes';
import type { AccessRequestInvitationOrigin } from '../accessRequestTypes';

/** Compose only source-owned facts; Account Setup credentials never enter this read model. */
export async function readPlatformAccessRequestRows(input: {
	requests: IdentityPlatformAccessRequestStore;
	invitations: OrganizationPlatformInvitationReader;
	accounts: Pick<IdentityPlatformSupportReader, 'loadUserLabels'>;
}): Promise<PlatformAccessRequestAdminRow[]> {
	const requests = await input.requests.listAccessRequests();
	const origins = await input.invitations.listInvitationOrigins(requests.map((row) => row.id));
	const inviterIds = [...new Set([...origins.values()].flatMap((rows) => rows.map((row) => row.invited_by)))];
	const labels = await input.accounts.loadUserLabels(inviterIds);
	return requests.map((request) => ({
		...request,
		invitation_origins: shapeAccessRequestInvitationOrigins(origins.get(request.id) ?? [], labels)
	}));
}

export function shapeAccessRequestInvitationOrigins(
	facts: OrganizationSupportInvitationOriginFact[],
	labels: Map<string, IdentitySupportUserLabel>
): AccessRequestInvitationOrigin[] {
	return [...facts]
		.sort((a, b) => new Date(b.invited_at).getTime() - new Date(a.invited_at).getTime())
		.map((fact) => {
			const label = labels.get(fact.invited_by) ?? null;
			return shapeInvitationOrigin(fact, label?.email ?? null, label);
		});
}

function shapeInvitationOrigin(
	link: OrganizationSupportInvitationOriginFact,
	inviterEmail: string | null,
	inviterProfile: IdentitySupportUserLabel | null
) {
	const organization = link.organizations;
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

function formatInviterProfileLabel(profile: IdentitySupportUserLabel | null): string | null {
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
