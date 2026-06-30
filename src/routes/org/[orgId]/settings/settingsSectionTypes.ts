import type { CapabilityLevel, DurableFeatureLane, MembershipRole, ScopeSet } from '$lib/access/memberAccessShape';
import type { RankCategory, RankPayGrade, RankService, RankState } from '$lib/domain/rankCatalog';
import type { AuditLogQueryResult } from '$lib/server/core/useCases/auditLogQuery';
import type { OrganizationRankCatalogReferenceSummary } from '$lib/server/core/useCases/rankCatalog';
import type { EffectiveTier, Tier } from '$lib/types/subscription';
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

export type SettingsExportInfo = {
	exportsUsed: number;
	exportsLimit: number;
	isLimited: boolean;
	limitReached: boolean;
	planBadge: string;
	upgradeTarget: Tier | null;
	limitReachedRemediation: string;
};

export type SettingsActivityData = {
	pendingApprovalsCount: number;
	approvalRequests: DeletionRequestRow[];
	auditLog: AuditLogQueryResult;
};

export type SettingsApprovalsSectionData = {
	activity: SettingsActivityData;
};

export type SettingsExportsSectionData = {
	exportInfo: SettingsExportInfo;
	commands: {
		canExportJson: boolean;
		canExportExcel: boolean;
	};
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
	tier: EffectiveTier | null;
	canUpdateProfile: boolean;
	canUpdateUrlSlug: boolean;
};

export type SettingsMembersSectionData = {
	rows: SettingsMemberRow[];
	invitations: SettingsInvitationRow[];
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
	missingCount: number;
	isInstalled: boolean;
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
