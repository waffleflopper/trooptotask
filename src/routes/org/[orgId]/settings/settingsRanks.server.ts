import {
	BUILT_IN_RANK_CATALOG,
	type RankCategory,
	type RankPayGrade,
	type RankService,
	type RankState
} from '$lib/domain/rankCatalog';
import type { UseCaseContext } from '$lib/server/core/ports';
import {
	loadOrganizationRankCatalog,
	loadOrganizationRankCatalogReferenceSummaries,
	type OrganizationRankCatalogEntry,
	type OrganizationRankCatalogReferenceSummary
} from '$lib/server/core/useCases/rankCatalog';
import type {
	SettingsRankCatalogRow,
	SettingsRankOption,
	SettingsRankServicePackOption,
	SettingsRanksSectionData
} from './settingsSectionTypes';

const SERVICE_OPTIONS: Array<SettingsRankOption<RankService>> = [
	{ value: 'army', label: 'Army' },
	{ value: 'navy', label: 'Navy' },
	{ value: 'air-force', label: 'Air Force' },
	{ value: 'marine-corps', label: 'Marine Corps' },
	{ value: 'coast-guard', label: 'Coast Guard' },
	{ value: 'space-force', label: 'Space Force' },
	{ value: 'civilian', label: 'Civilian' },
	{ value: 'custom', label: 'Custom' }
];

const SERVICE_PACK_SERVICES: RankService[] = [
	'army',
	'navy',
	'air-force',
	'marine-corps',
	'coast-guard',
	'space-force'
];

const CATEGORY_OPTIONS: Array<SettingsRankOption<RankCategory>> = [
	{ value: 'officer', label: 'Officer' },
	{ value: 'warrant', label: 'Warrant' },
	{ value: 'enlisted', label: 'Enlisted' },
	{ value: 'civilian', label: 'Civilian' },
	{ value: 'custom', label: 'Custom' }
];

const PAY_GRADE_VALUES: RankPayGrade[] = [
	'O-10',
	'O-9',
	'O-8',
	'O-7',
	'O-6',
	'O-5',
	'O-4',
	'O-3',
	'O-2',
	'O-1',
	'W-5',
	'W-4',
	'W-3',
	'W-2',
	'W-1',
	'E-9',
	'E-8',
	'E-7',
	'E-6',
	'E-5',
	'E-4',
	'E-3',
	'E-2',
	'E-1',
	'ungraded'
];

const PAY_GRADE_OPTIONS: Array<SettingsRankOption<RankPayGrade>> = PAY_GRADE_VALUES.map((value) => ({
	value,
	label: value === 'ungraded' ? 'Ungraded' : value
}));

const STATE_OPTIONS: Array<SettingsRankOption<RankState>> = [
	{ value: 'active', label: 'Active' },
	{ value: 'retired', label: 'Retired' }
];

const SOURCE_LABELS: Record<OrganizationRankCatalogEntry['source'], string> = {
	'built-in': 'Built-in',
	discovered: 'Discovered',
	custom: 'Custom'
};

export type RanksSettingsData = {
	sections: {
		ranks: SettingsRanksSectionData;
	};
};

export interface BuildRanksSettingsDataInput {
	catalog: OrganizationRankCatalogEntry[];
	referenceSummaries: OrganizationRankCatalogReferenceSummary[];
	canManageCatalog: boolean;
}

export async function loadRanksSettings(ctx: UseCaseContext): Promise<RanksSettingsData> {
	const catalog = await loadOrganizationRankCatalog(ctx, { authorization: 'organization-governance' });
	const referenceSummaries = await loadOrganizationRankCatalogReferenceSummaries(
		ctx,
		{
			codes: catalog.map((entry) => entry.code)
		},
		{ authorization: 'organization-governance' }
	);

	return buildRanksSettingsData({
		catalog,
		referenceSummaries,
		canManageCatalog: ctx.auth.role === 'owner' || ctx.auth.role === 'admin'
	});
}

export function buildRanksSettingsData(input: BuildRanksSettingsDataInput): RanksSettingsData {
	const referenceSummaries = new Map(input.referenceSummaries.map((summary) => [summary.code, summary]));
	const rows = input.catalog.map((entry) =>
		buildRankCatalogRow(entry, referenceSummaries.get(entry.code), input.canManageCatalog)
	);

	return {
		sections: {
			ranks: {
				entries: {
					active: rows.filter((entry) => entry.state === 'active'),
					retired: rows.filter((entry) => entry.state === 'retired')
				},
				servicePacks: buildServicePackOptions(input.catalog),
				options: {
					services: SERVICE_OPTIONS,
					categories: CATEGORY_OPTIONS,
					payGrades: PAY_GRADE_OPTIONS,
					states: STATE_OPTIONS
				},
				copy: {
					payGradeHelp: 'Pay grade groups ranks for cross-service ordering without changing Personnel rank strings.',
					tieBreakHelp: 'Tie-break order only decides display order when ranks share the same pay grade.'
				},
				commands: {
					canManageCatalog: input.canManageCatalog,
					canAddServicePack: input.canManageCatalog,
					canAddCustomRank: input.canManageCatalog
				}
			}
		}
	};
}

function buildRankCatalogRow(
	entry: OrganizationRankCatalogEntry,
	referenceSummary: OrganizationRankCatalogReferenceSummary | undefined,
	canManageCatalog: boolean
): SettingsRankCatalogRow {
	const summary = referenceSummary ?? unavailableReferenceSummary(entry.code);
	const isBuiltIn = entry.source === 'built-in';
	const canDeleteBySource = !isBuiltIn;
	const canDelete = canManageCatalog && canDeleteBySource && summary.canDelete;

	return {
		code: entry.code,
		label: entry.label,
		service: entry.service,
		serviceLabel: optionLabel(SERVICE_OPTIONS, entry.service),
		category: entry.category,
		categoryLabel: optionLabel(CATEGORY_OPTIONS, entry.category),
		payGrade: entry.payGrade,
		payGradeLabel: optionLabel(PAY_GRADE_OPTIONS, entry.payGrade),
		state: entry.state,
		source: entry.source,
		sourceLabel: SOURCE_LABELS[entry.source],
		sortOrder: entry.sortOrder,
		referenceSummary: summary,
		warnings: buildReferenceWarnings(summary),
		commands: {
			canEdit: canManageCatalog && !isBuiltIn,
			canRetire: canManageCatalog && entry.state === 'active',
			canReactivate: canManageCatalog && entry.state === 'retired',
			canDelete,
			deleteDisabledReason: deleteDisabledReason(entry, summary)
		}
	};
}

function buildServicePackOptions(catalog: OrganizationRankCatalogEntry[]): SettingsRankServicePackOption[] {
	const existingCodes = new Set(catalog.map((entry) => entry.code));

	return SERVICE_PACK_SERVICES.map((service) => {
		const builtInEntries = BUILT_IN_RANK_CATALOG.filter((entry) => entry.service === service);
		const existingCount = builtInEntries.filter((entry) => existingCodes.has(entry.code)).length;
		const missingCount = builtInEntries.length - existingCount;

		return {
			value: service,
			label: optionLabel(SERVICE_OPTIONS, service),
			builtInCount: builtInEntries.length,
			existingCount,
			missingCount,
			isInstalled: missingCount === 0
		};
	});
}

function deleteDisabledReason(
	entry: OrganizationRankCatalogEntry,
	summary: OrganizationRankCatalogReferenceSummary
): string | null {
	if (entry.source === 'built-in') {
		return 'Built-in ranks can be retired but not removed.';
	}
	if (!summary.canDelete) {
		if (summary.activeReferences.total === 0 && summary.historicalReferences.total === 0) {
			return 'Reference check unavailable; retire it instead.';
		}
		if (summary.activeReferences.total > 0) {
			return 'Referenced by active Organization data; retire it instead.';
		}
		return 'Referenced by historical snapshots or saved filters; retire it instead.';
	}
	return null;
}

function buildReferenceWarnings(summary: OrganizationRankCatalogReferenceSummary): string[] {
	const warnings: string[] = [];
	if (summary.activeReferences.total > 0) {
		warnings.push(
			`Referenced by ${referenceCountLabel(summary.activeReferences.total, 'active record or filter', 'active records or filters')}. Retire this rank to preserve existing records.`
		);
	}
	if (summary.historicalReferences.total > 0) {
		warnings.push(
			`Also appears in ${referenceCountLabel(summary.historicalReferences.total, 'historical snapshot or saved filter', 'historical snapshots or saved filters')}.`
		);
	}
	return warnings;
}

function referenceCountLabel(count: number, singular: string, plural: string): string {
	return `${count} ${count === 1 ? singular : plural}`;
}

function optionLabel<Value extends string>(options: Array<SettingsRankOption<Value>>, value: Value): string {
	return options.find((option) => option.value === value)?.label ?? value;
}

function unavailableReferenceSummary(code: string): OrganizationRankCatalogReferenceSummary {
	return {
		code,
		activeReferences: {
			personnel: 0,
			trainingApplicability: 0,
			dutyRosterTemplateFilters: 0,
			legacyDutyTemplateSlots: 0,
			total: 0
		},
		historicalReferences: {
			signInRosterFilters: 0,
			signInRosterSnapshots: 0,
			acceptedDutyRosterSnapshots: 0,
			total: 0
		},
		canDelete: false
	};
}
