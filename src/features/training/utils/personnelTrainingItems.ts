import type { Personnel } from '$features/personnel/contracts';
import { compareReadinessItems, type ReadinessItemStatus } from '$lib/domain/readinessItem';
import type {
	PersonnelTraining,
	TrainingCompletionHistoryEntry,
	TrainingStatus,
	TrainingType
} from '../training.types';
import { isTrainingApplicable } from './applicability';
import { getTrainingStatus } from './trainingStatus';

/** Why a requirement applies to this Person, for the row's detail line. */
export type TrainingApplicability =
	| { kind: 'all' }
	| { kind: 'mos'; mos: string }
	| { kind: 'role'; role: string }
	| { kind: 'rank'; rank: string };

export interface PersonnelTrainingItem {
	typeId: string;
	name: string;
	status: ReadinessItemStatus;
	daysUntilExpiration: number | null;
	cycleMonths: number | null;
	expirationDateOnly: boolean;
	canBeExempted: boolean;
	applicability: TrainingApplicability;
	completion: PersonnelTraining | null;
	/** Superseded completions, most recent completion first. */
	history: TrainingCompletionHistoryEntry[];
}

export interface PersonnelTrainingReadiness {
	personnelId: string;
	mos: string;
	/** Required items, ranked expired, missing, expiring, then current by soonest expiry. */
	items: PersonnelTrainingItem[];
	notRequiredCount: number;
	exemptCount: number;
}

const ITEM_STATUS: Partial<Record<TrainingStatus, ReadinessItemStatus>> = {
	expired: 'expired',
	'not-completed': 'missing',
	'warning-orange': 'expiring',
	'warning-yellow': 'expiring',
	current: 'current'
};

function applicabilityFor(type: TrainingType, person: Personnel): TrainingApplicability {
	if (type.appliesToMos.includes(person.mos)) return { kind: 'mos', mos: person.mos };
	if (type.appliesToRoles.includes(person.clinicRole)) return { kind: 'role', role: person.clinicRole };
	const rank = person.rank.trim();
	if (type.appliesToRanks.includes(rank)) return { kind: 'rank', rank };
	return { kind: 'all' };
}

function historyKey(row: TrainingCompletionHistoryEntry): string {
	return `${row.completionDate ?? row.expirationDate ?? ''}|${row.supersededAt}`;
}

function isExempt(type: TrainingType, person: Personnel): boolean {
	return type.canBeExempted && type.exemptPersonnelIds.includes(person.id);
}

export function buildPersonnelTrainingReadiness(input: {
	person: Personnel;
	types: TrainingType[];
	completions: PersonnelTraining[];
	history: TrainingCompletionHistoryEntry[];
	asOf: string;
}): PersonnelTrainingReadiness {
	const { person, types, asOf } = input;
	const completionByType = new Map(input.completions.map((row) => [row.trainingTypeId, row]));
	const historyByType = new Map<string, TrainingCompletionHistoryEntry[]>();
	for (const row of input.history.toSorted((a, b) => historyKey(b).localeCompare(historyKey(a)))) {
		historyByType.set(row.trainingTypeId, [...(historyByType.get(row.trainingTypeId) ?? []), row]);
	}
	let notRequiredCount = 0;
	let exemptCount = 0;
	const items: PersonnelTrainingItem[] = [];

	for (const type of types) {
		if (isExempt(type, person)) {
			exemptCount++;
			continue;
		}
		if (!isTrainingApplicable(type, person)) {
			notRequiredCount++;
			continue;
		}
		const completion = completionByType.get(type.id) ?? null;
		const info = getTrainingStatus(completion ?? undefined, type, person, asOf);
		items.push({
			typeId: type.id,
			name: type.name,
			status: ITEM_STATUS[info.status] ?? 'missing',
			daysUntilExpiration: info.daysUntilExpiration,
			cycleMonths: type.expirationMonths,
			expirationDateOnly: type.expirationDateOnly,
			canBeExempted: type.canBeExempted,
			applicability: applicabilityFor(type, person),
			completion,
			history: historyByType.get(type.id) ?? []
		});
	}

	return {
		personnelId: person.id,
		mos: person.mos,
		items: items.sort(compareReadinessItems),
		notRequiredCount,
		exemptCount
	};
}
