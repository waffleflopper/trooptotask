import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { RankCategory, RankPayGrade, RankService, RankState } from '$features/personnel/contracts';
import type { AuditLogQueryResult } from '$lib/server/core/useCases/auditLogQuery';
import type { OrganizationRankCatalogReferenceSummary } from '$features/personnel/contracts';
import type { DeletionRequestRow } from './settingsRows.server';
import type { SettingsMemberRow } from '$features/organization/contracts';

export type WorkspaceConstraint<Unit extends string> = {
	min: number;
	max: number;
	unit: Unit;
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
