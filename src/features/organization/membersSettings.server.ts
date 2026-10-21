import {
	DURABLE_FEATURE_LANES,
	TARGET_MEMBER_PRESET_CAPABILITIES,
	type MembershipRole,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';
import { ACCOUNT_SETUP_RECOVERY_LINK_LABEL, type AccessRequestSetupState } from '$features/identity/index.server';
import type { SettingsAccessSourceRow, OrganizationSettingsInvitationDeliveryRow } from './organizationSettingsTypes';
import type { OrganizationSettingsReader, OrganizationInvitationSetupStateLookupPort } from './contracts';
import { buildSettingsInvitationAccessRow, buildSettingsMemberAccessRow } from './settingsMemberAccessReadModel.server';
import type {
	SettingsInvitationFunnelStatus,
	SettingsInvitationHistoryRow,
	SettingsInvitationRow,
	MembersSettingsData,
	SettingsMembersSectionData,
	SettingsMemberRow,
	SettingsPendingInvitationRow
} from './memberSettingsTypes';
import { disabledFeatureLanes, type FeatureKey } from '$lib/access/featureSwitches';
import type { SettingsInvitationAccessRow } from './settingsMemberAccessModel';
import { ACCESS_LANE_LABELS, CAPABILITY_LEVEL_LABELS } from './settingsMemberAccessConstants';

export interface LoadMembersSettingsInput {
	isAdmin: boolean;
	groups: Promise<Array<{ id: string; name: string }>>;
	/** Invitations whose status left `pending`. Streams into the history row, so the roster does not wait on it. */
	closedInvitations: Promise<SettingsAccessSourceRow[]>;
}

export interface BuildMembersSettingsDataInput {
	currentMemberRole: MembershipRole;
	canManageMembers: boolean;
	isAdmin: boolean;
	members: SettingsAccessSourceRow[];
	/** Invitations still `pending`; those past their expiry join the history. */
	invitations: SettingsAccessSourceRow[];
	closedInvitations: Promise<SettingsAccessSourceRow[]>;
	invitationDeliveries?: OrganizationSettingsInvitationDeliveryRow[];
	/** Platform Account Setup state per invitation id. Absent entries mean no Access Request exists. */
	invitationSetupStates?: Map<string, AccessRequestSetupState>;
	groups: Array<{ id: string; name: string }>;
	disabledFeatures: readonly FeatureKey[];
	now?: Date;
}

interface MembersSettingsLoadContext {
	auth: { orgId: string; role: MembershipRole; canManageMembers: boolean };
	disabledFeatures: readonly FeatureKey[];
	organizationSettings: Pick<
		OrganizationSettingsReader,
		'listMemberAccess' | 'listInvitations' | 'listInvitationDeliveries'
	>;
	organizationInvitationSetupStateLookup?: OrganizationInvitationSetupStateLookupPort;
}

export async function loadMembersSettings(
	ctx: MembersSettingsLoadContext,
	input: LoadMembersSettingsInput
): Promise<MembersSettingsData> {
	const [membershipRows, invitationRows, invitationDeliveryRows, groups] = await Promise.all([
		ctx.organizationSettings.listMemberAccess(ctx.auth.orgId),
		ctx.organizationSettings.listInvitations(ctx.auth.orgId, 'pending'),
		ctx.organizationSettings.listInvitationDeliveries(ctx.auth.orgId),
		input.groups
	]);

	return buildMembersSettingsData({
		currentMemberRole: ctx.auth.role,
		canManageMembers: ctx.auth.canManageMembers,
		isAdmin: input.isAdmin,
		members: membershipRows,
		invitations: invitationRows,
		closedInvitations: input.closedInvitations,
		invitationDeliveries: invitationDeliveryRows,
		invitationSetupStates: await loadInvitationSetupStates(ctx, invitationRows),
		groups,
		disabledFeatures: ctx.disabledFeatures
	});
}

/**
 * The status line is context, not the reason the members screen exists, so a missing or failing
 * lookup degrades it to invitation-email state rather than taking the whole screen down
 * (ADR 0012).
 */
async function loadInvitationSetupStates(
	ctx: Pick<MembersSettingsLoadContext, 'auth' | 'organizationInvitationSetupStateLookup'>,
	invitations: SettingsAccessSourceRow[]
): Promise<Map<string, AccessRequestSetupState> | undefined> {
	const lookup = ctx.organizationInvitationSetupStateLookup;
	if (!lookup) return undefined;

	const pendingInvitationIds = invitations
		.filter((invitation) => invitation.status === 'pending')
		.map((invitation) => invitation.id)
		.filter((id): id is string => typeof id === 'string' && id.length > 0);

	try {
		return await lookup.findSetupStateByInvitationId(ctx.auth.orgId, pendingInvitationIds);
	} catch (error) {
		// Degrading silently would leave every row reading "Waiting on them to accept" with nothing
		// anywhere to say the platform read is down, so the failure is logged even though it is
		// deliberately invisible to the admin.
		console.error('[members-settings]', {
			operation: 'loadInvitationSetupStates',
			organizationId: ctx.auth.orgId,
			error: error instanceof Error ? error.message : 'Invitation setup state lookup failed'
		});
		return undefined;
	}
}

export function buildMembersSettingsData(input: BuildMembersSettingsDataInput): MembersSettingsData {
	const isOwner = input.currentMemberRole === 'owner';
	const canManageMembers = input.canManageMembers;

	return {
		currentMember: {
			role: input.currentMemberRole,
			isOwner,
			isAdmin: input.isAdmin,
			canManageMembers
		},
		sections: {
			members: buildMembersSettingsSection(input)
		}
	};
}

export function buildMembersSettingsSection(input: BuildMembersSettingsDataInput): SettingsMembersSectionData {
	const canManageMembers = input.canManageMembers;
	const groups = input.groups.map(({ id, name }) => ({ id, name }));
	const now = input.now ?? new Date();
	const latestDeliveryByInvitationId = buildLatestDeliveryByInvitationId(input.invitationDeliveries ?? []);
	const pendingInvitations = input.invitations.map(buildSettingsInvitationAccessRow);
	const invitations = pendingInvitations
		.filter((invitation) => isActionableInvitation(invitation, now))
		.map((invitation) => shapeInvitationRow(invitation, groups, latestDeliveryByInvitationId, now))
		.map((invitation) => withInvitationFunnelStatus(invitation, input.invitationSetupStates));
	const lapsedInvitations = pendingInvitations.filter((invitation) => !isActionableInvitation(invitation, now));

	return {
		rows: input.members.map((row) => shapeMemberRow(buildSettingsMemberAccessRow(row), groups)),
		invitations,
		invitationHistory: input.closedInvitations.then((closed) =>
			[...lapsedInvitations, ...closed.map(buildSettingsInvitationAccessRow)]
				.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
				.map((invitation) => shapeInvitationHistoryRow(invitation, now))
		),
		groups,
		offLanes: disabledFeatureLanes(input.disabledFeatures),
		canInvite: canManageMembers,
		canManageMemberAccess: canManageMembers
	};
}

function shapeMemberRow(
	member: ReturnType<typeof buildSettingsMemberAccessRow>,
	groups: Array<{ id: string; name: string }>
): SettingsMemberRow {
	return {
		...member,
		scopeDisplayLabel: formatScopeSet(member.access.scopeSet, groups),
		overriddenCapabilityLabels: overriddenCapabilityLabels(member)
	};
}

function shapeInvitationRow(
	invitation: ReturnType<typeof buildSettingsInvitationAccessRow>,
	groups: Array<{ id: string; name: string }>,
	deliveryByInvitationId: Map<string, OrganizationSettingsInvitationDeliveryRow>,
	now: Date
): SettingsInvitationRow {
	const delivery = deliveryByInvitationId.get(invitation.id) ?? null;
	const deliveryStatus = delivery?.status ?? 'not_sent';

	return {
		...invitation,
		scopeDisplayLabel: formatScopeSet(invitation.access.scopeSet, groups),
		deliveryStatus,
		deliveryStatusLabel: invitationDeliveryStatusLabel(deliveryStatus),
		deliveryAttemptCount: delivery?.attempt_count ?? 0,
		deliveryLastError: delivery?.last_error ?? null,
		deliveryUpdatedAt: delivery?.updated_at ?? null,
		deliverySentAt: delivery?.sent_at ?? null,
		canResend: isPendingUnexpiredInvitation(invitation, now)
	};
}

/**
 * Setup states where delivery or setup is still in progress. A claimed link may need Platform
 * support if the provider outcome is uncertain; its detail explains that a resend cannot unlock
 * it. Other incomplete states have no delivered credential the invitee can act on, and the
 * admin's remedy is the recovery link in the invitation email (ADR 0012).
 *
 * `replaced` is the one that does not read as credential-in-hand on its face, since it means the
 * newest link is revoked. It belongs here because of which revocations can reach a *pending*
 * invitation: `'replaced'` is written in the same transaction that inserts its replacement, so a
 * reader sees the live link instead; `'cleanup'` only
 * touches links that have already expired, and a link expires alongside the invitation that
 * issued it, so that row has left the funnel for history; `'manual'` comes only from platform
 * rescind, which also blocks the linked pending invitation (ADR 0012).
 */
const CREDENTIAL_IN_HAND_SETUP_STATES: ReadonlySet<AccessRequestSetupState> = new Set([
	'pending',
	'delivery_pending',
	'claimed',
	'replaced'
]);

/**
 * Collapses the whole invite funnel to one organization-facing status line.
 *
 * Evaluated in funnel order — the first blocking stage wins — so platform Account Setup
 * vocabulary stops here and never crosses the network boundary (ADR 0012). A missing setup
 * state means no Access Request exists, because the invitee already had a User Account.
 */
function withInvitationFunnelStatus(
	invitation: SettingsInvitationRow,
	setupStateByInvitationId: Map<string, AccessRequestSetupState> | undefined
): SettingsPendingInvitationRow {
	const setupState = setupStateByInvitationId?.get(invitation.id);
	const funnelStatus: SettingsInvitationFunnelStatus =
		invitation.deliveryStatus === 'failed'
			? 'invitation_email_failed'
			: !setupState || setupState === 'completed'
				? 'waiting_on_them_to_accept'
				: CREDENTIAL_IN_HAND_SETUP_STATES.has(setupState)
					? 'waiting_on_them'
					: 'setup_email_failed';

	return {
		...invitation,
		funnelStatus,
		funnelStatusLabel: INVITATION_FUNNEL_COPY[funnelStatus].label,
		funnelStatusDetail:
			setupState === 'claimed' && funnelStatus === 'waiting_on_them'
				? 'Account setup is in progress or held for support review. If it does not finish, contact Platform support. Resending the invitation will not unlock the setup link.'
				: INVITATION_FUNNEL_COPY[funnelStatus].detail
	};
}

const INVITATION_FUNNEL_COPY: Record<SettingsInvitationFunnelStatus, { label: string; detail: string }> = {
	invitation_email_failed: {
		label: 'Invitation email failed',
		detail: 'We could not deliver the invitation email. Check the address and resend.'
	},
	// The label names the most common cause rather than every one: it also covers a setup link
	// that was never issued, lapsed, or errored partway. The remedy is the same in all of them,
	// and naming it keeps the hint that the email is where to look (ADR 0012).
	setup_email_failed: {
		label: "Setup email didn't reach them",
		detail: `They have no account setup link they can use. Resending the invitation will not fix that — ask them to use the "${ACCOUNT_SETUP_RECOVERY_LINK_LABEL}" link in the invitation email.`
	},
	waiting_on_them: {
		label: 'Waiting on them',
		detail: 'They have been sent a link to set up their account and have not finished using it yet.'
	},
	waiting_on_them_to_accept: {
		label: 'Waiting on them to accept',
		detail: 'Nothing is blocking them. They can accept this invitation whenever they are ready.'
	}
};

function buildLatestDeliveryByInvitationId(
	deliveries: OrganizationSettingsInvitationDeliveryRow[]
): Map<string, OrganizationSettingsInvitationDeliveryRow> {
	const latest = new Map<string, OrganizationSettingsInvitationDeliveryRow>();
	for (const delivery of deliveries) {
		if (!latest.has(delivery.invitation_id)) {
			latest.set(delivery.invitation_id, delivery);
		}
	}
	return latest;
}

function invitationDeliveryStatusLabel(status: SettingsInvitationRow['deliveryStatus']): string {
	switch (status) {
		case 'sent':
			return 'Email sent';
		case 'failed':
			return 'Email failed';
		case 'pending':
			return 'Email pending';
		case 'not_sent':
			return 'Email not sent';
	}
}

function shapeInvitationHistoryRow(invitation: SettingsInvitationAccessRow, now: Date): SettingsInvitationHistoryRow {
	const lifecycleStatus = getInvitationLifecycleStatus(invitation, now);
	const historyStatus = lifecycleStatus === 'pending' ? 'closed' : lifecycleStatus;
	return {
		...invitation,
		lifecycleStatus: historyStatus,
		lifecycleStatusLabel: invitationLifecycleStatusLabel(historyStatus),
		lifecycleAt: getInvitationLifecycleAt(invitation, historyStatus)
	};
}

function isActionableInvitation(invitation: SettingsInvitationAccessRow, now: Date): boolean {
	return getInvitationLifecycleStatus(invitation, now) === 'pending';
}

function isPendingUnexpiredInvitation(
	invitation: Pick<SettingsInvitationRow, 'status' | 'expiresAt'>,
	now: Date
): boolean {
	return (
		invitation.status === 'pending' &&
		(!invitation.expiresAt || new Date(invitation.expiresAt).getTime() > now.getTime())
	);
}

function getInvitationLifecycleStatus(
	invitation: SettingsInvitationAccessRow,
	now: Date
): SettingsInvitationHistoryRow['lifecycleStatus'] | 'pending' {
	if (
		invitation.status === 'pending' &&
		invitation.expiresAt &&
		new Date(invitation.expiresAt).getTime() <= now.getTime()
	) {
		return 'expired';
	}

	if (
		invitation.status === 'accepted' ||
		invitation.status === 'declined' ||
		invitation.status === 'revoked' ||
		invitation.status === 'expired' ||
		invitation.status === 'blocked'
	) {
		return invitation.status;
	}

	if (invitation.status === 'pending') {
		return 'pending';
	}

	return 'closed';
}

function getInvitationLifecycleAt(
	invitation: SettingsInvitationAccessRow,
	lifecycleStatus: SettingsInvitationHistoryRow['lifecycleStatus']
): string {
	if (lifecycleStatus === 'accepted') return invitation.acceptedAt ?? invitation.createdAt;
	if (lifecycleStatus === 'declined') return invitation.declinedAt ?? invitation.createdAt;
	if (lifecycleStatus === 'revoked') return invitation.revokedAt ?? invitation.createdAt;
	if (lifecycleStatus === 'expired') return invitation.expiredAt ?? invitation.expiresAt ?? invitation.createdAt;
	if (lifecycleStatus === 'blocked') return invitation.blockedAt ?? invitation.createdAt;
	return invitation.createdAt;
}

function invitationLifecycleStatusLabel(lifecycleStatus: SettingsInvitationHistoryRow['lifecycleStatus']): string {
	if (lifecycleStatus === 'accepted') return 'Accepted';
	if (lifecycleStatus === 'declined') return 'Declined';
	if (lifecycleStatus === 'revoked') return 'Revoked';
	if (lifecycleStatus === 'expired') return 'Expired';
	if (lifecycleStatus === 'blocked') return 'Blocked';
	return 'Closed';
}

function editablePresetForMemberPreset(memberPreset: string): StoredMemberPreset {
	return memberPreset === 'viewer' || memberPreset === 'operator' || memberPreset === 'editor'
		? memberPreset
		: 'editor';
}

function overriddenCapabilityLabels(member: ReturnType<typeof buildSettingsMemberAccessRow>): string[] {
	const memberPreset = editablePresetForMemberPreset(member.access.memberPreset);
	return DURABLE_FEATURE_LANES.filter(
		(lane) => member.access.capabilityMap[lane] !== TARGET_MEMBER_PRESET_CAPABILITIES[memberPreset][lane]
	).map((lane) => `${ACCESS_LANE_LABELS[lane]}: ${CAPABILITY_LEVEL_LABELS[member.access.capabilityMap[lane]]}`);
}

function formatScopeSet(
	scopeSet: ReturnType<typeof buildSettingsMemberAccessRow>['access']['scopeSet'],
	groups: Array<{ id: string; name: string }>
): string {
	if (scopeSet.kind === 'organization') return 'All groups';
	if (scopeSet.groupIds.length === 0) return 'No groups';
	return scopeSet.groupIds
		.map((groupId) => groups.find((group) => group.id === groupId)?.name ?? 'Unknown group')
		.join(', ');
}
