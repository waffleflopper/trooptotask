import { comparePersonnelByRankThenName } from '$lib/domain/personnelRank';
import type { Da6ReasonCode, Da6ReasonParams } from './da6ReasonText';
import type {
	Da6Cell,
	Da6CellCode,
	Da6Column,
	DutyRosterSequenceKey,
	DutyRosterSequenceKind,
	DutyRosterSnapshotPersonnel
} from './dutyRosterRun.types';

export interface AvailabilityClassification {
	selectable: boolean;
	code: Da6CellCode;
	da6Code: Da6Cell['da6Code'];
	chargeable: boolean;
	reasonCode: Da6ReasonCode | null;
	reasonParams?: Da6ReasonParams;
}

type Da6RosterSequenceInfo = {
	sequenceKind: DutyRosterSequenceKind;
	sequenceKey: DutyRosterSequenceKey;
};

export type Da6RosterEngineRow = {
	date: string;
	assigneeId: string | null;
	reasonCode?: Da6ReasonCode;
	reasonParams?: Da6ReasonParams;
};

export interface Da6RosterEngineInput {
	pool: DutyRosterSnapshotPersonnel[];
	dutyDates: string[];
	sequenceByDate: Map<string, Da6RosterSequenceInfo>;
	classificationByPersonDate: Map<string, Map<string, AvailabilityClassification>>;
	priorLastDutyDates: Map<string, string | null>;
	manualBaselineCounts: Map<string, number>;
	initialDa6Counts?: Map<string, Map<DutyRosterSequenceKey, number>>;
}

export interface Da6RosterEngineOutput {
	columns: Da6Column[];
	rosterRows: Da6RosterEngineRow[];
	cellsByPersonnelId: Map<string, Da6Cell[]>;
}

interface DutyPriority {
	compare(a: DutyRosterSnapshotPersonnel, b: DutyRosterSnapshotPersonnel): number;
	recordSelection(personId: string, date: string): void;
	recordPassedOver(personId: string): void;
}

interface Da6Numbering {
	current(personId: string, sequenceKey: DutyRosterSequenceKey, isChargeableThisDate: boolean): number | null;
	record(
		personId: string,
		sequenceKey: DutyRosterSequenceKey,
		outcome: { assigned: boolean; chargeable: boolean }
	): void;
}

function compareOldestFirst(a: string | null, b: string | null): number {
	if (a && b && a !== b) {
		return a.localeCompare(b);
	}
	if (a && !b) {
		return 1;
	}
	if (!a && b) {
		return -1;
	}
	return 0;
}

function lastDutyDatePriority(seed: Map<string, string | null>): DutyPriority {
	const lastDutyDates = new Map(seed);

	return {
		compare(a, b) {
			const lastDutyDiff = compareOldestFirst(lastDutyDates.get(a.id) ?? null, lastDutyDates.get(b.id) ?? null);
			if (lastDutyDiff !== 0) {
				return lastDutyDiff;
			}
			return comparePersonnelByRankThenName(a, b);
		},
		recordSelection(personId, date) {
			lastDutyDates.set(personId, date);
		},
		recordPassedOver() {
			// Date-based Duty Priority does not track chargeable pass-overs.
		}
	};
}

function baselineCountPriority(seed: Map<string, number>): DutyPriority {
	const selectionCounts = new Map(seed);

	return {
		compare(a, b) {
			const countDiff = (selectionCounts.get(b.id) ?? 0) - (selectionCounts.get(a.id) ?? 0);
			if (countDiff !== 0) {
				return countDiff;
			}
			return comparePersonnelByRankThenName(a, b);
		},
		recordSelection(personId) {
			selectionCounts.set(personId, 0);
		},
		recordPassedOver(personId) {
			selectionCounts.set(personId, (selectionCounts.get(personId) ?? 0) + 1);
		}
	};
}

function createDa6Numbering(initialDa6Counts: Map<string, Map<DutyRosterSequenceKey, number>>): Da6Numbering {
	const sequenceNumberByPerson = new Map<string, number>();

	function keyFor(personId: string, sequenceKey: DutyRosterSequenceKey): string {
		return `${sequenceKey}::${personId}`;
	}

	function initialCount(personId: string, sequenceKey: DutyRosterSequenceKey): number | undefined {
		const counts = initialDa6Counts.get(personId);
		return counts?.get(sequenceKey) ?? counts?.get('single');
	}

	function current(personId: string, sequenceKey: DutyRosterSequenceKey, isChargeableThisDate: boolean): number | null {
		let sequenceNumber = sequenceNumberByPerson.get(keyFor(personId, sequenceKey));
		if (sequenceNumber === undefined) {
			sequenceNumber = initialCount(personId, sequenceKey);
		}
		if (sequenceNumber === undefined && isChargeableThisDate) {
			sequenceNumber = 1;
		}
		return sequenceNumber ?? null;
	}

	return {
		current,
		record(personId, sequenceKey, outcome) {
			const sequenceNumber = current(personId, sequenceKey, outcome.chargeable);
			const sequenceBaseKey = keyFor(personId, sequenceKey);
			if (outcome.assigned) {
				sequenceNumberByPerson.set(sequenceBaseKey, 1);
			} else if (outcome.chargeable && sequenceNumber !== null) {
				sequenceNumberByPerson.set(sequenceBaseKey, sequenceNumber + 1);
			} else if (sequenceNumber !== null) {
				sequenceNumberByPerson.set(sequenceBaseKey, sequenceNumber);
			}
		}
	};
}

function initialDa6CountsFromManualBaseline(
	manualBaselineCounts: Map<string, number>
): Map<string, Map<DutyRosterSequenceKey, number>> {
	return new Map([...manualBaselineCounts].map(([personId, count]) => [personId, new Map([['single', count]])]));
}

function priorityCountsFromInitialDa6Counts(
	initialDa6Counts: Map<string, Map<DutyRosterSequenceKey, number>>,
	sequenceKey: DutyRosterSequenceKey
): Map<string, number> {
	return new Map(
		[...initialDa6Counts]
			.map(([personId, counts]) => {
				const count = counts.get(sequenceKey) ?? counts.get('single');
				return typeof count === 'number' && Number.isInteger(count) && count > 0 ? ([personId, count] as const) : null;
			})
			.filter((entry): entry is readonly [string, number] => entry !== null)
	);
}

function getSequenceInfo(input: Da6RosterEngineInput, date: string): Da6RosterSequenceInfo {
	const sequenceInfo = input.sequenceByDate.get(date);
	if (!sequenceInfo) {
		throw new Error(`Missing DA6 sequence classification for ${date}`);
	}
	return sequenceInfo;
}

function getClassification(input: Da6RosterEngineInput, personnelId: string, date: string): AvailabilityClassification {
	const classification = input.classificationByPersonDate.get(personnelId)?.get(date);
	if (!classification) {
		throw new Error(`Missing DA6 availability classification for ${personnelId} on ${date}`);
	}
	return classification;
}

function buildCell(
	personnelId: string,
	date: string,
	classification: AvailabilityClassification,
	queuePosition: number | null,
	sequenceNumber: number | null,
	assigned: boolean
): Da6Cell {
	const reasonCode = assigned ? null : classification.reasonCode;
	const reasonParams = reasonCode && classification.reasonParams ? { ...classification.reasonParams } : undefined;
	if (reasonParams?.statusNames) {
		reasonParams.statusNames = [...reasonParams.statusNames];
	}
	return {
		date,
		personnelId,
		code: assigned ? 'assigned' : classification.code,
		da6Code: assigned ? null : classification.da6Code,
		chargeable: classification.chargeable,
		queuePosition,
		sequenceNumber,
		assigned,
		reason: null,
		reasonCode,
		...(reasonParams ? { reasonParams } : {})
	};
}

export function computeDa6Roster(input: Da6RosterEngineInput): Da6RosterEngineOutput {
	const initialDa6Counts = input.initialDa6Counts ?? initialDa6CountsFromManualBaseline(input.manualBaselineCounts);
	const datePriority = lastDutyDatePriority(input.priorLastDutyDates);
	const sequencePriorities = new Map<DutyRosterSequenceKey, DutyPriority>();
	const cellsByPersonnelId = new Map<string, Da6Cell[]>(input.pool.map((person) => [person.id, []]));
	const columns: Da6Column[] = [];
	const sequencePeriodCounters = new Map<DutyRosterSequenceKey, number>([
		['single', 0],
		['weekday', 0],
		['weekend-holiday', 0]
	]);
	const numbering = createDa6Numbering(initialDa6Counts);
	const rosterRows: Da6RosterEngineRow[] = [];

	for (const date of input.dutyDates) {
		const { sequenceKind, sequenceKey } = getSequenceInfo(input, date);
		let priority = sequencePriorities.get(sequenceKey);
		if (!priority) {
			const priorityCountSeed = priorityCountsFromInitialDa6Counts(initialDa6Counts, sequenceKey);
			priority = priorityCountSeed.size > 0 ? baselineCountPriority(priorityCountSeed) : datePriority;
			sequencePriorities.set(sequenceKey, priority);
		}
		const usesSharedDatePriority = priority === datePriority;
		const classifications = new Map(input.pool.map((person) => [person.id, getClassification(input, person.id, date)]));
		const rankedPersonnel = [...input.pool].sort((a, b) => priority.compare(a, b));
		const queue = rankedPersonnel.filter((person) => classifications.get(person.id)?.chargeable);
		const assigned = rankedPersonnel.find((person) => classifications.get(person.id)?.selectable) ?? null;
		const sequencePeriodIndex = sequencePeriodCounters.get(sequenceKey) ?? 0;
		const chargeSequenceStart = queue.length > 0 ? sequencePeriodIndex + 1 : null;
		const queuePositionByPersonnelId = new Map(queue.map((candidate, index) => [candidate.id, index + 1]));

		columns.push({
			date,
			sequenceKind,
			sequenceKey,
			specialDayIds: [],
			chargeSequenceStart,
			chargeableCount: queue.length
		});

		rosterRows.push(
			assigned ? { date, assigneeId: assigned.id } : { date, assigneeId: null, reasonCode: 'no-eligible-personnel' }
		);

		if (assigned) {
			priority.recordSelection(assigned.id, date);
			if (!usesSharedDatePriority) {
				datePriority.recordSelection(assigned.id, date);
			}
		}

		for (const person of input.pool) {
			const classification = classifications.get(person.id)!;
			const queuePosition = queuePositionByPersonnelId.get(person.id) ?? null;
			const isAssigned = assigned?.id === person.id;
			const sequenceNumber = numbering.current(person.id, sequenceKey, classification.chargeable);
			cellsByPersonnelId
				.get(person.id)!
				.push(buildCell(person.id, date, classification, queuePosition, sequenceNumber, isAssigned));
			numbering.record(person.id, sequenceKey, { assigned: isAssigned, chargeable: classification.chargeable });

			if (!isAssigned && classification.chargeable) {
				priority.recordPassedOver(person.id);
			}
		}

		sequencePeriodCounters.set(sequenceKey, sequencePeriodIndex + 1);
	}

	return { columns, rosterRows, cellsByPersonnelId };
}
