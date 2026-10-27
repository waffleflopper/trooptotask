import type { MembershipRole } from '$lib/access/memberAccessShape';
import type { RankCategory, RankPayGrade, RankService, RankState } from '$features/personnel/contracts';
import type { AuditLogQueryResult } from '$lib/audit/contracts';
import type { OrganizationRankCatalogReferenceSummary } from '$features/personnel/contracts';

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

export type SettingsCurrentMemberData = {
	role: MembershipRole;
	isOwner: boolean;
	isAdmin: boolean;
	canManageMembers: boolean;
};
export type SettingsRankOption<Value extends string> = {
	value: Value;
	label: string;
};

export type SettingsRankServicePackOption = SettingsRankOption<RankService> & {
	builtInCount: number;
	existingCount: number;
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
	sortOrder: number;
	referenceSummary: OrganizationRankCatalogReferenceSummary;
	/** What the rank's references mean for removing it, one sentence each. */
	warnings: string[];
	commands: {
		canEdit: boolean;
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

export type RanksSettingsData = {
	sections: {
		ranks: SettingsRanksSectionData;
	};
};

export interface LogsSettingsData {
	auditLog: AuditLogQueryResult;
	/** The viewer's IANA time zone; day heads and clock times use it so server and browser render the same text. */
	timeZone: string;
	/** "YYYY-MM-DD" in `timeZone` when the page loaded. */
	today: string;
}
