import {
	DURABLE_FEATURE_LANES,
	TARGET_MEMBER_PRESET_CAPABILITIES,
	type CapabilityLevel,
	type MembershipRole,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';
import { ACCOUNT_SETUP_RECOVERY_LINK_LABEL, type AccessRequestSetupState } from '$lib/server/accessRequestSetupState';
import type { UseCaseContext } from '$lib/server/core/ports';
import { GroupEntity } from '$lib/server/entities/group';
import {
	buildSettingsInvitationAccessRow,
	buildSettingsMemberAccessRow,
	type SettingsAccessSourceRow
} from '../settingsMemberAccessReadModel.server';
import type {
	SettingsInvitationFunnelStatus,
	SettingsInvitationHistoryRow,
	SettingsInvitationRow,
	SettingsMemberRow,
	SettingsPendingInvitationRow
} from '../settingsSectionTypes';
import {
	ACCESS_LANE_LABELS,
	SETTINGS_ACCESS_LANES,
	SETTINGS_ACCESS_OPTIONS,
	SETTINGS_CAPABILITY_OPTIONS
} from '../settingsMemberAccessConstants';
import { pluralize } from '../settingsWorkspaceFormatters';
import type { DeletionRequestRow } from '../settingsRows.server';

export interface LoadMembersSettingsInput {
	isAdmin: boolean;
}

export interface MembersSettingsData {
	currentMember: {
		role: MembershipRole;
		isOwner: boolean;
		isAdmin: boolean;
		canManageMembers: boolean;
	};
	sections: {
		members: MembersSettingsSection;
	};
}

export interface MembersSettingsSection {
	rows: SettingsMemberRow[];
	invitations: SettingsPendingInvitationRow[];
	invitationHistory: SettingsInvitationHistoryRow[];
	groups: Array<{ id: string; name: string }>;
	roleCounts: Record<'owner' | 'admin' | 'member', number>;
	memberRoleSummary: string;
	pendingApprovalSummary: PendingApprovalSummary;
	availableAccessLanes: typeof SETTINGS_ACCESS_LANES;
	capabilityOptions: typeof SETTINGS_CAPABILITY_OPTIONS;
	canInvite: boolean;
	canManageMemberAccess: boolean;
}

export interface BuildMembersSettingsDataInput {
	currentMemberRole: MembershipRole;
	canManageMembers: boolean;
	isAdmin: boolean;
	members: SettingsAccessSourceRow[];
	invitations: SettingsAccessSourceRow[];
	invitationDeliveries?: SettingsInvitationDeliverySourceRow[];
	/** Platform Account Setup state per invitation id. Absent entries mean no Access Request exists. */
	invitationSetupStates?: Map<string, AccessRequestSetupState>;
	pendingApprovalSummary?: PendingApprovalSummary;
	approvalRequests?: DeletionRequestRow[];
	groups: Record<string, unknown>[];
	now?: Date;
}

export interface PendingApprovalSummary {
	count: number;
	oldestCreatedAt: string | null;
}

export interface SettingsInvitationDeliverySourceRow {
	id: string;
	invitation_id: string;
	status: 'pending' | 'sent' | 'failed';
	attempt_count: number;
	last_error: string | null;
	updated_at: string;
	sent_at: string | null;
}

type MembersSettingsLoadContext = Pick<UseCaseContext, 'auth' | 'store' | 'organizationInvitationSetupStateLookup'>;

export async function loadMembersSettings(
	ctx: MembersSettingsLoadContext,
	input: LoadMembersSettingsInput
): Promise<MembersSettingsData> {
	const [membershipRows, invitationRows, invitationDeliveryRows, groupRows, approvalRequests] = await Promise.all([
		ctx.store.findMany<SettingsAccessSourceRow>('organization_memberships', ctx.auth.orgId, undefined, {
			select:
				'id, organization_id, user_id, email, role, created_at, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids'
		}),
		ctx.store.findMany<SettingsAccessSourceRow>('organization_invitations', ctx.auth.orgId, undefined, {
			select:
				'id, email, role, status, created_at, expires_at, accepted_at, declined_at, revoked_at, expired_at, blocked_at, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids',
			orderBy: [{ column: 'created_at', ascending: false }]
		}),
		ctx.store.findMany<SettingsInvitationDeliverySourceRow>(
			'organization_invitation_email_outbox',
			ctx.auth.orgId,
			undefined,
			{
				select: 'id, invitation_id, status, attempt_count, last_error, updated_at, sent_at',
				orderBy: [{ column: 'created_at', ascending: false }]
			}
		),
		ctx.store.findMany<Record<string, unknown>>('groups', ctx.auth.orgId, undefined, {
			orderBy: [{ column: 'sort_order', ascending: true }]
		}),
		ctx.store.findMany<DeletionRequestRow>('deletion_requests', ctx.auth.orgId, undefined, {
			orderBy: [{ column: 'created_at', ascending: false }]
		})
	]);

	return buildMembersSettingsData({
		currentMemberRole: ctx.auth.role,
		canManageMembers: ctx.auth.canManageMembers,
		isAdmin: input.isAdmin,
		members: membershipRows,
		invitations: invitationRows,
		invitationDeliveries: invitationDeliveryRows,
		invitationSetupStates: await loadInvitationSetupStates(ctx, invitationRows),
		approvalRequests,
		groups: groupRows
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

export function buildMembersSettingsSection(input: BuildMembersSettingsDataInput): MembersSettingsSection {
	const canManageMembers = input.canManageMembers;
	const groups = GroupEntity.fromDbArray(input.groups).map((group) => ({ id: group.id, name: group.name }));
	const availablePresetOptions = canManageMembers ? [...SETTINGS_ACCESS_OPTIONS] : [];
	const members = input.members.map((row) =>
		shapeMemberRow(buildSettingsMemberAccessRow(row), groups, availablePresetOptions)
	);
	const now = input.now ?? new Date();
	const latestDeliveryByInvitationId = buildLatestDeliveryByInvitationId(input.invitationDeliveries ?? []);
	const shapedInvitations = input.invitations.map((row) =>
		shapeInvitationRow(buildSettingsInvitationAccessRow(row), groups, latestDeliveryByInvitationId, now)
	);
	const invitations = shapedInvitations
		.filter((invitation) => isActionableInvitation(invitation, now))
		.map((invitation) => withInvitationFunnelStatus(invitation, input.invitationSetupStates));
	const invitationHistory = shapedInvitations
		.filter((invitation) => !isActionableInvitation(invitation, now))
		.map((invitation) => shapeInvitationHistoryRow(invitation, now));
	const roleCounts = members.reduce(
		(counts, member) => {
			counts[member.membershipRole] += 1;
			return counts;
		},
		{ owner: 0, admin: 0, member: 0 }
	);
	const pendingApprovalSummary =
		input.approvalRequests === undefined
			? (input.pendingApprovalSummary ?? { count: 0, oldestCreatedAt: null })
			: buildPendingApprovalSummary(input.approvalRequests);

	return {
		rows: members,
		invitations,
		invitationHistory,
		groups,
		roleCounts,
		memberRoleSummary: `${roleCounts.owner} ${pluralize('Owner', roleCounts.owner)} · ${roleCounts.admin} ${pluralize('Admin', roleCounts.admin)} · ${roleCounts.member} ${pluralize('Member', roleCounts.member)}`,
		pendingApprovalSummary,
		availableAccessLanes: SETTINGS_ACCESS_LANES,
		capabilityOptions: SETTINGS_CAPABILITY_OPTIONS,
		canInvite: canManageMembers,
		canManageMemberAccess: canManageMembers
	};
}

export function buildPendingApprovalSummary(
	approvalRequests: Array<Pick<DeletionRequestRow, 'status' | 'created_at'>>
): PendingApprovalSummary {
	const pendingCreatedDates = approvalRequests
		.filter((request) => request.status === 'pending')
		.map((request) => request.created_at)
		.filter(Boolean)
		.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

	return {
		count: pendingCreatedDates.length,
		oldestCreatedAt: pendingCreatedDates[0] ?? null
	};
}

function shapeMemberRow(
	member: ReturnType<typeof buildSettingsMemberAccessRow>,
	groups: Array<{ id: string; name: string }>,
	availablePresetOptions: SettingsMemberRow['editor']['availablePresetOptions']
): SettingsMemberRow {
	const editorPreset = editablePresetForMemberPreset(member.access.memberPreset);
	const scopeGroupIds = member.access.scopeSet.kind === 'groups' ? member.access.scopeSet.groupIds : [];
	const accessBadge =
		member.membershipRole === 'owner' || member.membershipRole === 'admin'
			? member.membershipRole
			: member.access.memberPreset;

	return {
		...member,
		editor: {
			selectedPreset: editorPreset,
			scopeKind: member.access.scopeSet.kind,
			scopeGroupIds,
			availablePresetOptions,
			availableGroups: groups
		},
		accessBadge,
		scopeDisplayLabel: formatScopeSet(member.access.scopeSet, groups),
		overriddenCapabilityLabels: overriddenCapabilityLabels(member)
	};
}

function shapeInvitationRow(
	invitation: ReturnType<typeof buildSettingsInvitationAccessRow>,
	groups: Array<{ id: string; name: string }>,
	deliveryByInvitationId: Map<string, SettingsInvitationDeliverySourceRow>,
	now: Date
): SettingsInvitationRow {
	const delivery = deliveryByInvitationId.get(invitation.id) ?? null;
	const deliveryStatus = delivery?.status ?? 'not_sent';

	return {
		...invitation,
		accessBadge: invitation.membershipRole === 'admin' ? 'admin' : invitation.access.memberPreset,
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
			: setupState === 'delivery_failed'
				? 'setup_email_failed'
				: setupState && setupState !== 'completed'
					? 'waiting_on_them'
					: 'waiting_on_them_to_accept';

	return {
		...invitation,
		funnelStatus,
		funnelStatusLabel: INVITATION_FUNNEL_COPY[funnelStatus].label,
		funnelStatusDetail: INVITATION_FUNNEL_COPY[funnelStatus].detail
	};
}

const INVITATION_FUNNEL_COPY: Record<SettingsInvitationFunnelStatus, { label: string; detail: string }> = {
	invitation_email_failed: {
		label: 'Invitation email failed',
		detail: 'We could not deliver the invitation email. Check the address and resend.'
	},
	setup_email_failed: {
		label: "Setup email didn't reach them",
		detail: `The invitation arrived but the email that lets them create their account did not. Resending the invitation will not fix that — ask them to use the "${ACCOUNT_SETUP_RECOVERY_LINK_LABEL}" link in the invitation email.`
	},
	waiting_on_them: {
		label: 'Waiting on them',
		detail: 'Both emails went out. They have not finished creating their account yet.'
	},
	waiting_on_them_to_accept: {
		label: 'Waiting on them to accept',
		detail: 'Nothing is blocking them. They can accept this invitation whenever they are ready.'
	}
};

function buildLatestDeliveryByInvitationId(
	deliveries: SettingsInvitationDeliverySourceRow[]
): Map<string, SettingsInvitationDeliverySourceRow> {
	const latest = new Map<string, SettingsInvitationDeliverySourceRow>();
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

function shapeInvitationHistoryRow(invitation: SettingsInvitationRow, now: Date): SettingsInvitationHistoryRow {
	const lifecycleStatus = getInvitationLifecycleStatus(invitation, now);
	const historyStatus = lifecycleStatus === 'pending' ? 'closed' : lifecycleStatus;
	return {
		...invitation,
		lifecycleStatus: historyStatus,
		lifecycleStatusLabel: invitationLifecycleStatusLabel(historyStatus),
		lifecycleDetail: invitationLifecycleDetail(historyStatus),
		lifecycleAt: getInvitationLifecycleAt(invitation, historyStatus)
	};
}

function isActionableInvitation(invitation: SettingsInvitationRow, now: Date): boolean {
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
	invitation: SettingsInvitationRow,
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
	invitation: SettingsInvitationRow,
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

function invitationLifecycleDetail(lifecycleStatus: SettingsInvitationHistoryRow['lifecycleStatus']): string | null {
	if (lifecycleStatus === 'blocked') {
		return 'Linked platform access was rejected or closed before account setup finished.';
	}

	return null;
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
	).map((lane) => `${ACCESS_LANE_LABELS[lane]}: ${formatCapability(member.access.capabilityMap[lane])}`);
}

function formatScopeSet(
	scopeSet: ReturnType<typeof buildSettingsMemberAccessRow>['access']['scopeSet'],
	groups: Array<{ id: string; name: string }>
): string {
	if (scopeSet.kind === 'organization') return 'All groups';
	return scopeSet.groupIds
		.map((groupId) => groups.find((group) => group.id === groupId)?.name ?? 'Unknown group')
		.join(', ');
}

function formatCapability(level: CapabilityLevel): string {
	return level[0].toUpperCase() + level.slice(1);
}
