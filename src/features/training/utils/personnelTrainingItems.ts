import type { PersonnelRequirementPerson } from '$features/personnel/contracts';
import { compareReadinessItems, type ReadinessItemStatus } from '$lib/domain/readinessItem';
import type {
	PersonnelTraining,
	TrainingCompletionHistoryEntry,
	TrainingRequirementFacts,
	TrainingStatus
} from '../training.types';
import { isTrainingApplicable } from './applicability';
import { getTrainingStatus } from './trainingStatus';

/** Why a requirement applies to this Person, for the row's detail line. */
export type TrainingApplicability =
	| { kind: 'all' }
	| { kind: 'mos'; mos: string }
	| { kind: 'role'; role: string }
	| { kind: 'rank'; rank: string };

export type TrainingCompletionFacts = Pick<PersonnelTraining, 'trainingTypeId' | 'completionDate' | 'expirationDate'>;

export interface PersonnelTrainingItem<C extends TrainingCompletionFacts = PersonnelTraining> {
	typeId: string;
	name: string;
	status: ReadinessItemStatus;
	daysUntilExpiration: number | null;
	cycleMonths: number | null;
	expirationDateOnly: boolean;
	canBeExempted: boolean;
	applicability: TrainingApplicability;
	completion: C | null;
	/** Superseded completions, most recent completion first. */
	history: TrainingCompletionHistoryEntry[];
}

export interface PersonnelTrainingReadiness<C extends TrainingCompletionFacts = PersonnelTraining> {
	personnelId: string;
	mos: string;
	/** Required items, ranked expired, missing, expiring, then current by soonest expiry. */
	items: PersonnelTrainingItem<C>[];
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

function applicabilityFor(type: TrainingRequirementFacts, person: PersonnelRequirementPerson): TrainingApplicability {
	if (type.appliesToMos.includes(person.mos)) return { kind: 'mos', mos: person.mos };
	if (type.appliesToRoles.includes(person.clinicRole)) return { kind: 'role', role: person.clinicRole };
	const rank = person.rank.trim();
	if (type.appliesToRanks.includes(rank)) return { kind: 'rank', rank };
	return { kind: 'all' };
}

function historyKey(row: TrainingCompletionHistoryEntry): string {
	return `${row.completionDate ?? row.expirationDate ?? ''}|${row.supersededAt}`;
}

function isExempt(type: TrainingRequirementFacts, person: PersonnelRequirementPerson): boolean {
	return type.canBeExempted && type.exemptPersonnelIds.includes(person.id);
}

export function buildPersonnelTrainingReadiness<C extends TrainingCompletionFacts = PersonnelTraining>(input: {
	person: PersonnelRequirementPerson;
	types: readonly TrainingRequirementFacts[];
	completions: readonly C[];
	history: readonly TrainingCompletionHistoryEntry[];
	asOf: string;
}): PersonnelTrainingReadiness<C> {
	const { person, types, asOf } = input;
	const completionByType = new Map(input.completions.map((row) => [row.trainingTypeId, row]));
	const historyByType = new Map<string, TrainingCompletionHistoryEntry[]>();
	for (const row of input.history.toSorted((a, b) => historyKey(b).localeCompare(historyKey(a)))) {
		historyByType.set(row.trainingTypeId, [...(historyByType.get(row.trainingTypeId) ?? []), row]);
	}
	let notRequiredCount = 0;
	let exemptCount = 0;
	const items: PersonnelTrainingItem<C>[] = [];

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

function requiredFor(applicability: TrainingApplicability): string {
	switch (applicability.kind) {
		case 'all':
			return 'required for all Soldiers';
		case 'mos':
			return `required for ${applicability.mos}`;
		case 'role':
			return `required for ${applicability.role}`;
		case 'rank':
			return `required for ${applicability.rank}`;
	}
}

function days(count: number): string {
	return `${count} ${count === 1 ? 'day' : 'days'}`;
}

function statusFact(item: PersonnelTrainingItem): string | null {
	const daysLeft = item.daysUntilExpiration;
	switch (item.status) {
		case 'expired':
			return daysLeft !== null && daysLeft < 0 ? `lapsed ${days(-daysLeft)} ago` : 'lapsed today';
		case 'missing':
			return requiredFor(item.applicability);
		case 'expiring':
			return daysLeft === null ? null : `expires in ${days(daysLeft)}`;
		case 'current':
			return item.completion?.certificateUrl ? 'certificate on file' : null;
	}
}

/** The row's secondary line: the cycle, then the one fact a leader acts on for this status. */
export function describeTrainingItem(item: PersonnelTrainingItem): string {
	const cycle =
		item.cycleMonths !== null
			? `${item.cycleMonths}-month cycle`
			: item.expirationDateOnly
				? 'Expires on a set date'
				: 'Does not expire';
	const fact = statusFact(item);
	return fact ? `${cycle} · ${fact}` : cycle;
}
