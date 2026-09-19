import type { CapabilityLevel, DurableFeatureLane, MembershipRole, ScopeSet } from '$lib/access/memberAccessShape';
import type { RankCategory, RankPayGrade, RankService, RankState } from '$lib/domain/rankCatalog';
import type { AuditLogQueryResult } from '$lib/server/core/useCases/auditLogQuery';
import type { OrganizationRankCatalogReferenceSummary } from '$lib/server/core/useCases/rankCatalog';
import type { DeletionRequestRow } from './settingsRows.server';
import type { EditablePreset } from './settingsMemberAccessConstants';
import type { SettingsInvitationAccessRow, SettingsMemberAccessRow } from './settingsMemberAccessModel';

export type WorkspaceConstraint<Unit extends string> = {
	min: number;
	max: number;
	unit: Unit;
};

export type SettingsMemberRow = SettingsMemberAccessRow & {
	editor: {
		selectedPreset: EditablePreset;
		scopeKind: ScopeSet['kind'];
		scopeGroupIds: string[];
		availablePresetOptions: Array<{ value: EditablePreset; label: string; helper: string }>;
		availableGroups: Array<{ id: string; name: string }>;
	};
	accessBadge: 'owner' | 'admin' | 'viewer' | 'operator' | 'editor' | 'custom';
	scopeDisplayLabel: string;
	overriddenCapabilityLabels: string[];
};

/**
 * Where an invitee is stuck, across the whole invite funnel — invitation email, then account
 * setup email, then the invitee themselves. Platform setup-state vocabulary is collapsed into
 * these four on the server and never sent to the browser (ADR 0012).
 */
export type SettingsInvitationFunnelStatus =
	| 'invitation_email_failed'
	| 'setup_email_failed'
	| 'waiting_on_them'
	| 'waiting_on_them_to_accept';

export type SettingsInvitationRow = SettingsInvitationAccessRow & {
	accessBadge: 'admin' | 'viewer' | 'operator' | 'editor' | 'custom';
	scopeDisplayLabel: string;
	deliveryStatus: 'not_sent' | 'pending' | 'sent' | 'failed';
	deliveryStatusLabel: string;
	deliveryAttemptCount: number;
	deliveryLastError: string | null;
	deliveryUpdatedAt: string | null;
	deliverySentAt: string | null;
	canResend: boolean;
};

/** Only an invitation still awaiting acceptance has somewhere to be stuck. */
export type SettingsPendingInvitationRow = SettingsInvitationRow & {
	funnelStatus: SettingsInvitationFunnelStatus;
	funnelStatusLabel: string;
	funnelStatusDetail: string;
};

export type SettingsInvitationHistoryRow = SettingsInvitationRow & {
	lifecycleStatus: 'accepted' | 'declined' | 'revoked' | 'expired' | 'blocked' | 'closed';
	lifecycleStatusLabel: string;
	lifecycleDetail: string | null;
	lifecycleAt: string;
};

export type SettingsArchivedPersonnelRow = {
	id: string;
	rank: string;
	firstName: string;
	lastName: string;
	mos: string | null;
	groupName: string | null;
	archivedAt: string;
	groupId: string | null;
	displayName: string;
	exportFileStem: string;
};

export type SettingsArchivesSectionData = {
	rows: SettingsArchivedPersonnelRow[];
	retention: {
		months: number;
		purgeSummary: string;
	};
	commands: {
		canRestore: boolean;
		canExport: boolean;
		canPermanentlyDelete: boolean;
	};
};

export type SettingsActivityData = {
	pendingApprovalsCount: number;
	approvalRequests: DeletionRequestRow[];
	auditLog: AuditLogQueryResult;
};

export type SettingsApprovalsSectionData = {
	activity: SettingsActivityData;
};

export type SettingsOwnershipTransferCandidate = Pick<SettingsMemberRow, 'id' | 'userId' | 'email' | 'membershipRole'>;

export type SettingsPoliciesSectionData = {
	archiveRetention: {
		savedMonths: number;
		constraints: WorkspaceConstraint<'months'>;
	};
	lossWarning: {
		savedDays: number;
		constraints: WorkspaceConstraint<'days'>;
	};
	criticalTasks: {
		savedDefaultExpirationMonths: number;
		savedExpiringSoonWarningDays: number;
		defaultExpirationConstraints: WorkspaceConstraint<'months'>;
		expiringSoonWarningConstraints: WorkspaceConstraint<'days'>;
	};
	canUpdateRetention: boolean;
	canUpdateCriticalTasksSettings: boolean;
};

export type SettingsCurrentMemberData = {
	role: MembershipRole;
	isOwner: boolean;
	isAdmin: boolean;
	canManageMembers: boolean;
};

export type SettingsOrganizationSectionData = {
	id: string;
	name: string | null;
	urlSlug: string | null;
	urlSegment: string;
	canUpdateProfile: boolean;
	canUpdateUrlSlug: boolean;
};

export type SettingsMembersSectionData = {
	rows: SettingsMemberRow[];
	invitations: SettingsPendingInvitationRow[];
	invitationHistory: SettingsInvitationHistoryRow[];
	groups: Array<{ id: string; name: string }>;
	roleCounts: Record<'owner' | 'admin' | 'member', number>;
	memberRoleSummary: string;
	pendingApprovalSummary: { count: number; oldestCreatedAt: string | null };
	availableAccessLanes: Array<{ id: DurableFeatureLane; label: string }>;
	capabilityOptions: Array<{ value: CapabilityLevel; label: string }>;
	canInvite: boolean;
	canManageMemberAccess: boolean;
};

export type SettingsRankOption<Value extends string> = {
	value: Value;
	label: string;
};

export type SettingsRankServicePackOption = SettingsRankOption<RankService> & {
	builtInCount: number;
	existingCount: number;
	activeCount: number;
	retiredCount: number;
	missingCount: number;
	isInstalled: boolean;
	canBulkRetire: boolean;
	canBulkReactivate: boolean;
};

export type SettingsRankCatalogRow = {
	code: string;
	label: string;
	service: RankService;
	serviceLabel: string;
	category: RankCategory;
	categoryLabel: string;
	payGrade: RankPayGrade;
	payGradeLabel: string;
	state: RankState;
	source: 'built-in' | 'discovered' | 'custom';
	sourceLabel: string;
	sortOrder: number;
	referenceSummary: OrganizationRankCatalogReferenceSummary;
	warnings: string[];
	commands: {
		canEdit: boolean;
		canRetire: boolean;
		canReactivate: boolean;
		canDelete: boolean;
		deleteDisabledReason: string | null;
	};
};

export type SettingsRanksSectionData = {
	entries: {
		active: SettingsRankCatalogRow[];
		retired: SettingsRankCatalogRow[];
	};
	servicePacks: SettingsRankServicePackOption[];
	options: {
		services: Array<SettingsRankOption<RankService>>;
		categories: Array<SettingsRankOption<RankCategory>>;
		payGrades: Array<SettingsRankOption<RankPayGrade>>;
		states: Array<SettingsRankOption<RankState>>;
	};
	copy: {
		payGradeHelp: string;
		tieBreakHelp: string;
	};
	commands: {
		canManageCatalog: boolean;
		canAddServicePack: boolean;
		canAddCustomRank: boolean;
	};
};

export type SettingsDangerSectionData = {
	transferOwnershipCandidates: SettingsOwnershipTransferCandidate[];
	deleteConfirmation: {
		organizationName: string | null;
		normalizedOrganizationName: string;
	};
	commands: {
		canTransferOwnership: boolean;
		canDeleteOrganization: boolean;
	};
};

export type DangerSettingsData = {
	currentMember: SettingsCurrentMemberData;
	sections: {
		organization: SettingsOrganizationSectionData;
		dangerZone: SettingsDangerSectionData;
	};
};
