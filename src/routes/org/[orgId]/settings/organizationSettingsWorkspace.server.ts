import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
import {
	DURABLE_FEATURE_LANES,
	TARGET_MEMBER_PRESET_CAPABILITIES,
	type CapabilityLevel,
	type MembershipRole,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';
import type { AuditLogQueryResult } from '$lib/server/core/useCases/auditLogQuery';
import type { EffectiveTier } from '$lib/types/subscription';
import type { UseCaseContext } from '$lib/server/core/ports';
import { GroupEntity } from '$lib/server/entities/group';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import {
	ARCHIVE_RETENTION_CONSTRAINT,
	CRITICAL_TASKS_DEFAULT_EXPIRATION_CONSTRAINT,
	CRITICAL_TASKS_EXPIRING_SOON_WARNING_CONSTRAINT,
	DEFAULT_ARCHIVE_RETENTION_MONTHS,
	DEFAULT_LOSS_WARNING_WINDOW_DAYS,
	LOSS_WARNING_CONSTRAINT
} from './settingsPolicyConstraints';
import {
	buildSettingsInvitationAccessRow,
	buildSettingsMemberAccessRow,
	type LegacySettingsAccessRow
} from './settingsMemberAccessReadModel.server';
import { normalizeOrganizationName } from './settingsWorkspaceFormatters';
import type {
	OrganizationSettingsWorkspace,
	SettingsArchivedPersonnelRow,
	SettingsInvitationHistoryRow,
	SettingsInvitationRow,
	SettingsMemberRow,
	SettingsExportInfo
} from './organizationSettingsWorkspaceModel';
import {
	ACCESS_LANE_LABELS,
	SETTINGS_ACCESS_LANES,
	SETTINGS_ACCESS_OPTIONS,
	SETTINGS_CAPABILITY_OPTIONS
} from './settingsMemberAccessConstants';
import type { DeletionRequestRow, OrganizationSettingsRow } from './settingsRows.server';

export type { OrganizationSettingsWorkspace } from './organizationSettingsWorkspaceModel';

export interface LoadOrganizationSettingsWorkspaceInput {
	isAdmin: boolean;
	organization: OrganizationSettingsSource;
	exportInfo?: SettingsExportInfoSource | Promise<SettingsExportInfoSource>;
	auditLog?: AuditLogQueryResult | Promise<AuditLogQueryResult>;
}

export interface BuildOrganizationSettingsWorkspaceInput {
	currentMemberRole: MembershipRole;
	isAdmin: boolean;
	organization: OrganizationSettingsSource;
	members: LegacySettingsAccessRow[];
	invitations: LegacySettingsAccessRow[];
	invitationDeliveries?: SettingsInvitationDeliverySourceRow[];
	pendingApprovalSummary?: PendingApprovalSummary;
	approvalRequests?: DeletionRequestRow[];
	exportInfo?: SettingsExportInfoSource;
	auditLog?: AuditLogQueryResult;
	groups: Record<string, unknown>[];
	organizationSettings: OrganizationSettingsRow | null;
	archivedPersonnel: SettingsArchivedPersonnelSourceRow[];
}

export interface PendingApprovalSummary {
	count: number;
	oldestCreatedAt: string | null;
}

export interface OrganizationSettingsSource {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
	effectiveTier: EffectiveTier | null;
}

export type SettingsExportInfoSource = Pick<SettingsExportInfo, 'exportsUsed' | 'exportsLimit' | 'isLimited'>;

export interface SettingsInvitationDeliverySourceRow {
	id: string;
	invitation_id: string;
	status: 'pending' | 'sent' | 'failed';
	attempt_count: number;
	last_error: string | null;
	updated_at: string;
	sent_at: string | null;
}

export type SettingsArchivedPersonnelSourceRow = Pick<
	SettingsArchivedPersonnelRow,
	'id' | 'rank' | 'firstName' | 'lastName' | 'mos' | 'groupName' | 'archivedAt' | 'groupId'
>;

export async function loadOrganizationSettingsWorkspace(
	ctx: Pick<UseCaseContext, 'auth' | 'store' | 'rawStore'>,
	input: LoadOrganizationSettingsWorkspaceInput
): Promise<OrganizationSettingsWorkspace> {
	const [
		membershipRows,
		invitationRows,
		invitationDeliveryRows,
		groupRows,
		organizationSettings,
		archivedPersonnelRows,
		approvalRequests,
		exportInfo,
		auditLog
	] = await Promise.all([
		ctx.store.findMany<LegacySettingsAccessRow>('organization_memberships', ctx.auth.orgId),
		ctx.store.findMany<LegacySettingsAccessRow>('organization_invitations', ctx.auth.orgId, undefined, {
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
		ctx.rawStore.findOne<OrganizationSettingsRow>(
			'organizations',
			ctx.auth.orgId,
			{},
			'archive_retention_months, loss_warning_window_days, critical_tasks_default_expiration_months, critical_tasks_expiring_soon_warning_days'
		),
		ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
			select: PersonnelEntity.select,
			isNull: { archived_at: false },
			orderBy: [{ column: 'archived_at', ascending: false }]
		}),
		ctx.store.findMany<DeletionRequestRow>('deletion_requests', ctx.auth.orgId, undefined, {
			orderBy: [{ column: 'created_at', ascending: false }]
		}),
		Promise.resolve(input.exportInfo),
		Promise.resolve(input.auditLog)
	]);

	return buildOrganizationSettingsWorkspace({
		currentMemberRole: ctx.auth.role,
		isAdmin: input.isAdmin,
		organization: input.organization,
		members: membershipRows,
		invitations: invitationRows,
		invitationDeliveries: invitationDeliveryRows,
		pendingApprovalSummary: buildPendingApprovalSummary(approvalRequests),
		approvalRequests,
		exportInfo,
		auditLog,
		groups: groupRows,
		organizationSettings,
		archivedPersonnel: PersonnelEntity.fromDbArray(archivedPersonnelRows).map((p) => ({
			id: p.id,
			rank: p.rank,
			firstName: p.firstName,
			lastName: p.lastName,
			mos: p.mos,
			groupName: p.groupName,
			archivedAt: p.archivedAt as string,
			groupId: p.groupId
		}))
	});
}

export function buildOrganizationSettingsWorkspace(
	input: BuildOrganizationSettingsWorkspaceInput
): OrganizationSettingsWorkspace {
	const isOwner = input.currentMemberRole === 'owner';
	const canManageMembers = isOwner || input.currentMemberRole === 'admin';
	const groups = GroupEntity.fromDbArray(input.groups).map((group) => ({ id: group.id, name: group.name }));
	const availablePresetOptions = canManageMembers ? [...SETTINGS_ACCESS_OPTIONS] : [];
	const members = input.members.map((row) =>
		shapeMemberRow(buildSettingsMemberAccessRow(row), groups, availablePresetOptions)
	);
	const now = new Date();
	const latestDeliveryByInvitationId = buildLatestDeliveryByInvitationId(input.invitationDeliveries ?? []);
	const shapedInvitations = input.invitations.map((row) =>
		shapeInvitationRow(buildSettingsInvitationAccessRow(row), groups, latestDeliveryByInvitationId)
	);
	const invitations = shapedInvitations.filter((invitation) => isActionableInvitation(invitation, now));
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
	const criticalTasksSettings = normalizeCriticalTasksSettings({
		defaultExpirationMonths: input.organizationSettings?.critical_tasks_default_expiration_months ?? null,
		expiringSoonWarningDays: input.organizationSettings?.critical_tasks_expiring_soon_warning_days ?? null
	});
	const archiveRetentionMonths =
		input.organizationSettings?.archive_retention_months ?? DEFAULT_ARCHIVE_RETENTION_MONTHS;
	const archivedPersonnelRows = input.archivedPersonnel.map(shapeArchivedPersonnelRow);
	const approvalRequests = input.approvalRequests ?? [];
	const pendingApprovalSummary =
		input.approvalRequests === undefined
			? (input.pendingApprovalSummary ?? { count: 0, oldestCreatedAt: null })
			: buildPendingApprovalSummary(approvalRequests);
	const exportInfo = shapeExportInfo(input.exportInfo ?? defaultExportInfo());
	const auditLog = input.auditLog ?? emptyAuditLog();
	const dangerZone = shapeDangerZone({
		isOwner,
		organizationName: input.organization.name,
		members
	});

	return {
		currentMember: {
			role: input.currentMemberRole,
			isOwner,
			isAdmin: input.isAdmin,
			canManageMembers
		},
		sections: {
			organization: {
				id: input.organization.id,
				name: input.organization.name,
				urlSlug: input.organization.urlSlug,
				urlSegment: input.organization.urlSegment,
				tier: input.organization.effectiveTier,
				canUpdateProfile: canManageMembers,
				canUpdateUrlSlug: canManageMembers
			},
			members: {
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
			},
			policies: {
				archiveRetention: {
					savedMonths: archiveRetentionMonths,
					constraints: ARCHIVE_RETENTION_CONSTRAINT
				},
				lossWarning: {
					savedDays: input.organizationSettings?.loss_warning_window_days ?? DEFAULT_LOSS_WARNING_WINDOW_DAYS,
					constraints: LOSS_WARNING_CONSTRAINT
				},
				criticalTasks: {
					savedDefaultExpirationMonths: criticalTasksSettings.defaultExpirationMonths,
					savedExpiringSoonWarningDays: criticalTasksSettings.expiringSoonWarningDays,
					defaultExpirationConstraints: CRITICAL_TASKS_DEFAULT_EXPIRATION_CONSTRAINT,
					expiringSoonWarningConstraints: CRITICAL_TASKS_EXPIRING_SOON_WARNING_CONSTRAINT
				},
				canUpdateRetention: canManageMembers,
				canUpdateCriticalTasksSettings: canManageMembers
			},
			archivedPersonnel: {
				rows: archivedPersonnelRows,
				retention: {
					months: archiveRetentionMonths,
					purgeSummary:
						archivedPersonnelRows.length === 0
							? `Retention ${archiveRetentionMonths} months`
							: `${archivedPersonnelRows.length} archived ${pluralize('record', archivedPersonnelRows.length)}`
				},
				commands: {
					canRestore: canManageMembers,
					canExport: canManageMembers,
					canPermanentlyDelete: canManageMembers
				}
			},
			dataExport: {
				exportInfo,
				commands: {
					canExportJson: !exportInfo.limitReached,
					canExportExcel: !exportInfo.limitReached
				},
				activity: {
					pendingApprovalsCount: pendingApprovalSummary.count,
					approvalRequests,
					auditLog
				}
			},
			dangerZone
		}
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
	availablePresetOptions: OrganizationSettingsWorkspace['sections']['members']['rows'][number]['editor']['availablePresetOptions']
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
	deliveryByInvitationId: Map<string, SettingsInvitationDeliverySourceRow>
): SettingsInvitationRow {
	const delivery = deliveryByInvitationId.get(invitation.id) ?? null;
	return {
		...invitation,
		accessBadge: invitation.membershipRole === 'admin' ? 'admin' : invitation.access.memberPreset,
		scopeDisplayLabel: formatScopeSet(invitation.access.scopeSet, groups),
		deliveryStatus: delivery?.status ?? 'not_sent',
		deliveryStatusLabel: invitationDeliveryStatusLabel(delivery?.status ?? 'not_sent'),
		deliveryAttemptCount: delivery?.attempt_count ?? 0,
		deliveryLastError: delivery?.last_error ?? null,
		deliveryUpdatedAt: delivery?.updated_at ?? null,
		deliverySentAt: delivery?.sent_at ?? null,
		canResend: invitation.status === 'pending'
	};
}

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

function shapeArchivedPersonnelRow(row: SettingsArchivedPersonnelSourceRow): SettingsArchivedPersonnelRow {
	return {
		...row,
		displayName: `${row.rank} ${row.lastName}, ${row.firstName}`,
		exportFileStem: `${row.rank}-${row.lastName}`
	};
}

function shapeExportInfo(source: SettingsExportInfoSource): SettingsExportInfo {
	const limitReached = source.isLimited && source.exportsUsed >= source.exportsLimit;
	return {
		...source,
		limitReached,
		planBadge: source.isLimited ? 'Plan limited' : 'Unlimited exports'
	};
}

function shapeDangerZone(input: {
	isOwner: boolean;
	organizationName: string | null;
	members: SettingsMemberRow[];
}): OrganizationSettingsWorkspace['sections']['dangerZone'] {
	const transferOwnershipCandidates = input.isOwner
		? input.members
				.filter((member) => member.membershipRole !== 'owner' && member.userId)
				.map((member) => ({
					id: member.id,
					userId: member.userId,
					email: member.email,
					membershipRole: member.membershipRole
				}))
		: [];

	return {
		transferOwnershipCandidates,
		deleteConfirmation: {
			organizationName: input.organizationName,
			normalizedOrganizationName: normalizeOrganizationName(input.organizationName ?? '')
		},
		commands: {
			canTransferOwnership: input.isOwner && transferOwnershipCandidates.length > 0,
			canDeleteOrganization: input.isOwner
		}
	};
}

function defaultExportInfo(): SettingsExportInfoSource {
	return {
		exportsUsed: 0,
		exportsLimit: Infinity,
		isLimited: false
	};
}

function emptyAuditLog(): AuditLogQueryResult {
	return {
		logs: [],
		totalCount: 0,
		last30DaysCount: 0,
		page: 1,
		limit: 9,
		actionFilter: '',
		availableActions: []
	};
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

function pluralize(label: string, count: number): string {
	return count === 1 ? label : `${label}s`;
}
