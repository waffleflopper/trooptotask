import { normalizeCriticalTasksSettings } from '$features/critical-tasks/utils/ictStatus';
import {
	DURABLE_FEATURE_LANES,
	TARGET_MEMBER_PRESET_CAPABILITIES,
	type CapabilityLevel,
	type DurableFeatureLane,
	type MembershipRole,
	type StoredMemberPreset
} from '$lib/access/memberAccessShape';
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
import type {
	OrganizationSettingsWorkspace,
	SettingsArchivedPersonnelRow,
	SettingsInvitationRow,
	SettingsMemberRow
} from './organizationSettingsWorkspaceModel';
import {
	SETTINGS_ACCESS_LANES,
	SETTINGS_ACCESS_OPTIONS,
	SETTINGS_CAPABILITY_OPTIONS
} from './settingsMemberAccessConstants';
import type { DeletionRequestRow, OrganizationSettingsRow } from './settingsRows.server';

export type { OrganizationSettingsWorkspace } from './organizationSettingsWorkspaceModel';

export interface LoadOrganizationSettingsWorkspaceInput {
	isAdmin: boolean;
	organization: OrganizationSettingsSource;
}

export interface BuildOrganizationSettingsWorkspaceInput {
	currentMemberRole: MembershipRole;
	isAdmin: boolean;
	organization: OrganizationSettingsSource;
	members: LegacySettingsAccessRow[];
	invitations: LegacySettingsAccessRow[];
	pendingApprovalSummary?: PendingApprovalSummary;
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

export type SettingsArchivedPersonnelSourceRow = Pick<
	SettingsArchivedPersonnelRow,
	'id' | 'rank' | 'firstName' | 'lastName' | 'mos' | 'groupName' | 'archivedAt' | 'groupId'
>;

const ACCESS_LANE_LABELS: Record<DurableFeatureLane, string> = {
	calendar: 'Calendar',
	personnel: 'Personnel',
	training: 'Training',
	criticalTasks: 'Critical Tasks',
	onboarding: 'Onboarding',
	ratingScheme: 'Rating Scheme'
};

export async function loadOrganizationSettingsWorkspace(
	ctx: Pick<UseCaseContext, 'auth' | 'store' | 'rawStore'>,
	input: LoadOrganizationSettingsWorkspaceInput
): Promise<OrganizationSettingsWorkspace> {
	const [membershipRows, invitationRows, groupRows, organizationSettings, archivedPersonnelRows] = await Promise.all([
		ctx.store.findMany<LegacySettingsAccessRow>('organization_memberships', ctx.auth.orgId),
		ctx.store.findMany<LegacySettingsAccessRow>('organization_invitations', ctx.auth.orgId, {
			status: 'pending'
		}),
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
		})
	]);

	return buildOrganizationSettingsWorkspace({
		currentMemberRole: ctx.auth.role,
		isAdmin: input.isAdmin,
		organization: input.organization,
		members: membershipRows,
		invitations: invitationRows,
		pendingApprovalSummary: { count: 0, oldestCreatedAt: null },
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
	const availablePresetOptions = canManageMembers
		? isOwner
			? [...SETTINGS_ACCESS_OPTIONS]
			: SETTINGS_ACCESS_OPTIONS.filter((option) => option.value !== 'admin')
		: [];
	const members = input.members.map((row) =>
		shapeMemberRow(buildSettingsMemberAccessRow(row), groups, availablePresetOptions)
	);
	const invitations = input.invitations.map((row) => shapeInvitationRow(buildSettingsInvitationAccessRow(row), groups));
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
				groups,
				roleCounts,
				memberRoleSummary: `${roleCounts.owner} ${pluralize('Owner', roleCounts.owner)} · ${roleCounts.admin} ${pluralize('Admin', roleCounts.admin)} · ${roleCounts.member} ${pluralize('Member', roleCounts.member)}`,
				pendingApprovalSummary: input.pendingApprovalSummary ?? { count: 0, oldestCreatedAt: null },
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
			}
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

export function withOrganizationSettingsPendingApprovalSummary(
	workspace: OrganizationSettingsWorkspace,
	pendingApprovalSummary: PendingApprovalSummary
): OrganizationSettingsWorkspace {
	return {
		...workspace,
		sections: {
			...workspace.sections,
			members: {
				...workspace.sections.members,
				pendingApprovalSummary
			}
		}
	};
}

function shapeMemberRow(
	member: ReturnType<typeof buildSettingsMemberAccessRow>,
	groups: Array<{ id: string; name: string }>,
	availablePresetOptions: OrganizationSettingsWorkspace['sections']['members']['rows'][number]['editor']['availablePresetOptions']
): SettingsMemberRow {
	const editorPreset =
		member.membershipRole === 'admin' ? 'admin' : editablePresetForMemberPreset(member.access.memberPreset);
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
	groups: Array<{ id: string; name: string }>
): SettingsInvitationRow {
	return {
		...invitation,
		accessBadge: invitation.access.memberPreset,
		scopeDisplayLabel: formatScopeSet(invitation.access.scopeSet, groups)
	};
}

function shapeArchivedPersonnelRow(row: SettingsArchivedPersonnelSourceRow): SettingsArchivedPersonnelRow {
	return {
		...row,
		displayName: `${row.rank} ${row.lastName}, ${row.firstName}`,
		exportFileStem: `${row.rank}-${row.lastName}`
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
