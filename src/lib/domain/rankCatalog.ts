export type RankService =
	| 'army'
	| 'navy'
	| 'air-force'
	| 'marine-corps'
	| 'coast-guard'
	| 'space-force'
	| 'civilian'
	| 'custom';

export type RankCategory = 'officer' | 'warrant' | 'enlisted' | 'civilian' | 'custom';

export type RankState = 'active' | 'retired';

export type RankPayGrade = `${'O' | 'W' | 'E'}-${number}` | 'ungraded';

export interface RankCatalogEntry {
	code: string;
	label: string;
	service: RankService;
	category: RankCategory;
	payGrade: RankPayGrade;
	state: RankState;
	sortOrder: number;
}

export interface RankCompareOptions {
	direction?: 'highest-to-lowest' | 'lowest-to-highest';
	catalog?: readonly RankCatalogEntry[];
}

function rank(
	code: string,
	label: string,
	service: RankService,
	category: RankCategory,
	payGrade: RankPayGrade,
	sortOrder = 0,
	state: RankState = 'active'
): RankCatalogEntry {
	return { code, label, service, category, payGrade, state, sortOrder };
}

export const BUILT_IN_RANK_CATALOG: readonly RankCatalogEntry[] = [
	rank('GEN', 'General', 'army', 'officer', 'O-10'),
	rank('LTG', 'Lieutenant General', 'army', 'officer', 'O-9'),
	rank('MG', 'Major General', 'army', 'officer', 'O-8'),
	rank('BG', 'Brigadier General', 'army', 'officer', 'O-7'),
	rank('COL', 'Colonel', 'army', 'officer', 'O-6'),
	rank('LTC', 'Lieutenant Colonel', 'army', 'officer', 'O-5'),
	rank('MAJ', 'Major', 'army', 'officer', 'O-4'),
	rank('CPT', 'Captain', 'army', 'officer', 'O-3'),
	rank('1LT', 'First Lieutenant', 'army', 'officer', 'O-2'),
	rank('2LT', 'Second Lieutenant', 'army', 'officer', 'O-1'),
	rank('CW5', 'Chief Warrant Officer 5', 'army', 'warrant', 'W-5'),
	rank('CW4', 'Chief Warrant Officer 4', 'army', 'warrant', 'W-4'),
	rank('CW3', 'Chief Warrant Officer 3', 'army', 'warrant', 'W-3'),
	rank('CW2', 'Chief Warrant Officer 2', 'army', 'warrant', 'W-2'),
	rank('WO1', 'Warrant Officer 1', 'army', 'warrant', 'W-1'),
	rank('CSM', 'Command Sergeant Major', 'army', 'enlisted', 'E-9', 0),
	rank('SGM', 'Sergeant Major', 'army', 'enlisted', 'E-9', 1),
	rank('1SG', 'First Sergeant', 'army', 'enlisted', 'E-8', 0),
	rank('MSG', 'Master Sergeant', 'army', 'enlisted', 'E-8', 1),
	rank('SFC', 'Sergeant First Class', 'army', 'enlisted', 'E-7'),
	rank('SSG', 'Staff Sergeant', 'army', 'enlisted', 'E-6'),
	rank('SGT', 'Sergeant', 'army', 'enlisted', 'E-5'),
	rank('CPL', 'Corporal', 'army', 'enlisted', 'E-4', 0),
	rank('SPC', 'Specialist', 'army', 'enlisted', 'E-4', 1),
	rank('SP4', 'Specialist Four', 'army', 'enlisted', 'E-4', 2, 'retired'),
	rank('PFC', 'Private First Class', 'army', 'enlisted', 'E-3'),
	rank('PV2', 'Private Second Class', 'army', 'enlisted', 'E-2'),
	rank('PV1', 'Private', 'army', 'enlisted', 'E-1'),
	rank('ADM', 'Admiral', 'navy', 'officer', 'O-10'),
	rank('VADM', 'Vice Admiral', 'navy', 'officer', 'O-9'),
	rank('RADM', 'Rear Admiral', 'navy', 'officer', 'O-8'),
	rank('RDML', 'Rear Admiral Lower Half', 'navy', 'officer', 'O-7'),
	rank('CAPT', 'Captain', 'navy', 'officer', 'O-6'),
	rank('CDR', 'Commander', 'navy', 'officer', 'O-5'),
	rank('LCDR', 'Lieutenant Commander', 'navy', 'officer', 'O-4'),
	rank('LT', 'Lieutenant', 'navy', 'officer', 'O-3'),
	rank('LTJG', 'Lieutenant Junior Grade', 'navy', 'officer', 'O-2'),
	rank('ENS', 'Ensign', 'navy', 'officer', 'O-1'),
	rank('CWO5', 'Chief Warrant Officer 5', 'navy', 'warrant', 'W-5'),
	rank('CWO4', 'Chief Warrant Officer 4', 'navy', 'warrant', 'W-4'),
	rank('CWO3', 'Chief Warrant Officer 3', 'navy', 'warrant', 'W-3'),
	rank('CWO2', 'Chief Warrant Officer 2', 'navy', 'warrant', 'W-2'),
	rank('MCPO', 'Master Chief Petty Officer', 'navy', 'enlisted', 'E-9'),
	rank('SCPO', 'Senior Chief Petty Officer', 'navy', 'enlisted', 'E-8'),
	rank('CPO', 'Chief Petty Officer', 'navy', 'enlisted', 'E-7'),
	rank('PO1', 'Petty Officer First Class', 'navy', 'enlisted', 'E-6'),
	rank('PO2', 'Petty Officer Second Class', 'navy', 'enlisted', 'E-5'),
	rank('PO3', 'Petty Officer Third Class', 'navy', 'enlisted', 'E-4'),
	rank('SN', 'Seaman', 'navy', 'enlisted', 'E-3'),
	rank('SA', 'Seaman Apprentice', 'navy', 'enlisted', 'E-2'),
	rank('SR', 'Seaman Recruit', 'navy', 'enlisted', 'E-1'),
	rank('Gen', 'General', 'air-force', 'officer', 'O-10'),
	rank('Lt Gen', 'Lieutenant General', 'air-force', 'officer', 'O-9'),
	rank('Maj Gen', 'Major General', 'air-force', 'officer', 'O-8'),
	rank('Brig Gen', 'Brigadier General', 'air-force', 'officer', 'O-7'),
	rank('Col', 'Colonel', 'air-force', 'officer', 'O-6'),
	rank('Lt Col', 'Lieutenant Colonel', 'air-force', 'officer', 'O-5'),
	rank('Maj', 'Major', 'air-force', 'officer', 'O-4'),
	rank('Capt', 'Captain', 'air-force', 'officer', 'O-3'),
	rank('1st Lt', 'First Lieutenant', 'air-force', 'officer', 'O-2'),
	rank('2d Lt', 'Second Lieutenant', 'air-force', 'officer', 'O-1'),
	rank('CMSgt', 'Chief Master Sergeant', 'air-force', 'enlisted', 'E-9'),
	rank('SMSgt', 'Senior Master Sergeant', 'air-force', 'enlisted', 'E-8'),
	rank('MSgt', 'Master Sergeant', 'air-force', 'enlisted', 'E-7'),
	rank('TSgt', 'Technical Sergeant', 'air-force', 'enlisted', 'E-6'),
	rank('SSgt', 'Staff Sergeant', 'air-force', 'enlisted', 'E-5'),
	rank('SrA', 'Senior Airman', 'air-force', 'enlisted', 'E-4'),
	rank('A1C', 'Airman First Class', 'air-force', 'enlisted', 'E-3'),
	rank('Amn', 'Airman', 'air-force', 'enlisted', 'E-2'),
	rank('AB', 'Airman Basic', 'air-force', 'enlisted', 'E-1'),
	rank('USMC-Gen', 'General', 'marine-corps', 'officer', 'O-10'),
	rank('USMC-LtGen', 'Lieutenant General', 'marine-corps', 'officer', 'O-9'),
	rank('USMC-MajGen', 'Major General', 'marine-corps', 'officer', 'O-8'),
	rank('USMC-BGen', 'Brigadier General', 'marine-corps', 'officer', 'O-7'),
	rank('USMC-Col', 'Colonel', 'marine-corps', 'officer', 'O-6'),
	rank('USMC-LtCol', 'Lieutenant Colonel', 'marine-corps', 'officer', 'O-5'),
	rank('USMC-Maj', 'Major', 'marine-corps', 'officer', 'O-4'),
	rank('USMC-Capt', 'Captain', 'marine-corps', 'officer', 'O-3'),
	rank('USMC-1stLt', 'First Lieutenant', 'marine-corps', 'officer', 'O-2'),
	rank('USMC-2ndLt', 'Second Lieutenant', 'marine-corps', 'officer', 'O-1'),
	rank('USMC-CWO5', 'Chief Warrant Officer 5', 'marine-corps', 'warrant', 'W-5'),
	rank('USMC-CWO4', 'Chief Warrant Officer 4', 'marine-corps', 'warrant', 'W-4'),
	rank('USMC-CWO3', 'Chief Warrant Officer 3', 'marine-corps', 'warrant', 'W-3'),
	rank('USMC-CWO2', 'Chief Warrant Officer 2', 'marine-corps', 'warrant', 'W-2'),
	rank('USMC-WO1', 'Warrant Officer 1', 'marine-corps', 'warrant', 'W-1'),
	rank('SgtMaj', 'Sergeant Major', 'marine-corps', 'enlisted', 'E-9'),
	rank('MGySgt', 'Master Gunnery Sergeant', 'marine-corps', 'enlisted', 'E-9'),
	rank('MSgt-USMC', 'Master Sergeant', 'marine-corps', 'enlisted', 'E-8'),
	rank('1stSgt', 'First Sergeant', 'marine-corps', 'enlisted', 'E-8'),
	rank('GySgt', 'Gunnery Sergeant', 'marine-corps', 'enlisted', 'E-7'),
	rank('SSgt-USMC', 'Staff Sergeant', 'marine-corps', 'enlisted', 'E-6'),
	rank('Sgt-USMC', 'Sergeant', 'marine-corps', 'enlisted', 'E-5'),
	rank('Cpl-USMC', 'Corporal', 'marine-corps', 'enlisted', 'E-4'),
	rank('LCpl', 'Lance Corporal', 'marine-corps', 'enlisted', 'E-3'),
	rank('PFC-USMC', 'Private First Class', 'marine-corps', 'enlisted', 'E-2'),
	rank('Pvt-USMC', 'Private', 'marine-corps', 'enlisted', 'E-1'),
	rank('CG-ADM', 'Admiral', 'coast-guard', 'officer', 'O-10'),
	rank('CG-VADM', 'Vice Admiral', 'coast-guard', 'officer', 'O-9'),
	rank('CG-RADM', 'Rear Admiral', 'coast-guard', 'officer', 'O-8'),
	rank('CG-RDML', 'Rear Admiral Lower Half', 'coast-guard', 'officer', 'O-7'),
	rank('CG-CAPT', 'Captain', 'coast-guard', 'officer', 'O-6'),
	rank('CG-CDR', 'Commander', 'coast-guard', 'officer', 'O-5'),
	rank('CG-LCDR', 'Lieutenant Commander', 'coast-guard', 'officer', 'O-4'),
	rank('CG-LT', 'Lieutenant', 'coast-guard', 'officer', 'O-3'),
	rank('CG-LTJG', 'Lieutenant Junior Grade', 'coast-guard', 'officer', 'O-2'),
	rank('CG-ENS', 'Ensign', 'coast-guard', 'officer', 'O-1'),
	rank('CG-CWO4', 'Chief Warrant Officer 4', 'coast-guard', 'warrant', 'W-4'),
	rank('CG-CWO3', 'Chief Warrant Officer 3', 'coast-guard', 'warrant', 'W-3'),
	rank('CG-CWO2', 'Chief Warrant Officer 2', 'coast-guard', 'warrant', 'W-2'),
	rank('CG-MCPO', 'Master Chief Petty Officer', 'coast-guard', 'enlisted', 'E-9'),
	rank('CG-SCPO', 'Senior Chief Petty Officer', 'coast-guard', 'enlisted', 'E-8'),
	rank('CG-CPO', 'Chief Petty Officer', 'coast-guard', 'enlisted', 'E-7'),
	rank('CG-PO1', 'Petty Officer First Class', 'coast-guard', 'enlisted', 'E-6'),
	rank('CG-PO2', 'Petty Officer Second Class', 'coast-guard', 'enlisted', 'E-5'),
	rank('CG-PO3', 'Petty Officer Third Class', 'coast-guard', 'enlisted', 'E-4'),
	rank('CG-SN', 'Seaman', 'coast-guard', 'enlisted', 'E-3'),
	rank('CG-SA', 'Seaman Apprentice', 'coast-guard', 'enlisted', 'E-2'),
	rank('CG-SR', 'Seaman Recruit', 'coast-guard', 'enlisted', 'E-1'),
	rank('SF-Gen', 'General', 'space-force', 'officer', 'O-10'),
	rank('SF-LtGen', 'Lieutenant General', 'space-force', 'officer', 'O-9'),
	rank('SF-MajGen', 'Major General', 'space-force', 'officer', 'O-8'),
	rank('SF-BrigGen', 'Brigadier General', 'space-force', 'officer', 'O-7'),
	rank('SF-Col', 'Colonel', 'space-force', 'officer', 'O-6'),
	rank('SF-LtCol', 'Lieutenant Colonel', 'space-force', 'officer', 'O-5'),
	rank('SF-Maj', 'Major', 'space-force', 'officer', 'O-4'),
	rank('SF-Capt', 'Captain', 'space-force', 'officer', 'O-3'),
	rank('SF-1stLt', 'First Lieutenant', 'space-force', 'officer', 'O-2'),
	rank('SF-2dLt', 'Second Lieutenant', 'space-force', 'officer', 'O-1'),
	rank('CMSSF', 'Chief Master Sergeant of the Space Force', 'space-force', 'enlisted', 'E-9', 0),
	rank('SF-CMSgt', 'Chief Master Sergeant', 'space-force', 'enlisted', 'E-9', 1),
	rank('SF-SMSgt', 'Senior Master Sergeant', 'space-force', 'enlisted', 'E-8'),
	rank('SF-MSgt', 'Master Sergeant', 'space-force', 'enlisted', 'E-7'),
	rank('SF-TSgt', 'Technical Sergeant', 'space-force', 'enlisted', 'E-6'),
	rank('SF-SSgt', 'Staff Sergeant', 'space-force', 'enlisted', 'E-5'),
	rank('Spc4', 'Specialist 4', 'space-force', 'enlisted', 'E-4'),
	rank('Spc3', 'Specialist 3', 'space-force', 'enlisted', 'E-3'),
	rank('Spc2', 'Specialist 2', 'space-force', 'enlisted', 'E-2'),
	rank('Spc1', 'Specialist 1', 'space-force', 'enlisted', 'E-1'),
	rank('CIV', 'Civilian', 'civilian', 'civilian', 'ungraded'),
	rank('CUSTOM', 'Custom / Ungraded', 'custom', 'custom', 'ungraded')
] as const;

const PAY_GRADE_CATEGORY_ORDER = new Map([
	['O', 0],
	['W', 1],
	['E', 2]
]);

function rankCatalogIndex(catalog: readonly RankCatalogEntry[]): Map<string, RankCatalogEntry> {
	const index = new Map<string, RankCatalogEntry>();

	for (const entry of catalog) {
		index.set(entry.code, entry);
		if (!index.has(entry.code.toUpperCase())) {
			index.set(entry.code.toUpperCase(), entry);
		}
	}

	return index;
}

function payGradePrecedence(payGrade: RankPayGrade): number {
	if (payGrade === 'ungraded') {
		return 1_000;
	}

	const match = /^([OWE])-(\d+)$/.exec(payGrade.toUpperCase());
	if (!match) {
		return 1_000;
	}

	const categoryOrder = PAY_GRADE_CATEGORY_ORDER.get(match[1]) ?? 9;
	const grade = Number.parseInt(match[2], 10);

	return categoryOrder * 100 + (99 - grade);
}

function compareEntries(a: RankCatalogEntry, b: RankCatalogEntry): number {
	return (
		payGradePrecedence(a.payGrade) - payGradePrecedence(b.payGrade) ||
		a.sortOrder - b.sortOrder ||
		a.label.localeCompare(b.label, 'en-US') ||
		a.code.localeCompare(b.code, 'en-US')
	);
}

export function resolveBuiltInRank(code: string): RankCatalogEntry | undefined {
	const index = rankCatalogIndex(BUILT_IN_RANK_CATALOG);
	return index.get(code) ?? index.get(code.toUpperCase());
}

export function resolveRank(
	code: string,
	catalog: readonly RankCatalogEntry[] = BUILT_IN_RANK_CATALOG
): RankCatalogEntry {
	const index = rankCatalogIndex(catalog);
	const knownRank = index.get(code) ?? index.get(code.toUpperCase());

	return (
		knownRank ?? {
			code,
			label: code,
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 0
		}
	);
}

export function compareRankCodes(a: string, b: string, options: RankCompareOptions = {}): number {
	const catalog = options.catalog ?? BUILT_IN_RANK_CATALOG;
	const index = rankCatalogIndex(catalog);
	const aEntry = index.get(a) ?? index.get(a.toUpperCase());
	const bEntry = index.get(b) ?? index.get(b.toUpperCase());

	const comparison =
		aEntry && bEntry ? compareEntries(aEntry, bEntry) : aEntry ? -1 : bEntry ? 1 : a.localeCompare(b, 'en-US');

	return options.direction === 'lowest-to-highest' ? -comparison : comparison;
}
