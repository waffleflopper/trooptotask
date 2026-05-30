import { comparePersonnelByRankThenName } from '$lib/domain/personnelRank';
import type {
	Da6Cell,
	Da6CellCode,
	Da6Column,
	DutyRosterRunSnapshot,
	DutyRosterSequenceKey,
	DutyRosterSequenceKind,
	DutyRosterSnapshotPersonnel
} from './dutyRosterRun.types';

export interface AvailabilityClassification {
	selectable: boolean;
	code: Da6CellCode;
	da6Code: Da6Cell['da6Code'];
	chargeable: boolean;
	reason: string | null;
	reasonCode: string | null;
}

type Da6RosterSequenceInfo = {
	sequenceKind: DutyRosterSequenceKind;
	sequenceKey: DutyRosterSequenceKey;
};

export interface Da6RosterEngineInput {
	pool: DutyRosterSnapshotPersonnel[];
	dutyDates: string[];
	sequenceByDate: Map<string, Da6RosterSequenceInfo>;
	classificationByPersonDate: Map<string, Map<string, AvailabilityClassification>>;
	priorLastDutyDates: Map<string, string | null>;
	manualBaselineCounts: Map<string, number>;
}

export interface Da6RosterEngineOutput {
	columns: Da6Column[];
	rosterRows: DutyRosterRunSnapshot['rosterRows'];
	cellsByPersonnelId: Map<string, Da6Cell[]>;
}

interface DutyPriority {
	compare(a: DutyRosterSnapshotPersonnel, b: DutyRosterSnapshotPersonnel): number;
	recordSelection(personId: string, date: string): void;
	recordPassedOver(personId: string): void;
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
	return {
		date,
		personnelId,
		code: assigned ? 'assigned' : classification.code,
		da6Code: assigned ? null : classification.da6Code,
		chargeable: classification.chargeable,
		queuePosition,
		sequenceNumber,
		assigned,
		reason: assigned ? null : classification.reason,
		reasonCode: assigned ? null : classification.reasonCode
	};
}

export function computeDa6Roster(input: Da6RosterEngineInput): Da6RosterEngineOutput {
	const priority =
		input.manualBaselineCounts.size > 0
			? baselineCountPriority(input.manualBaselineCounts)
			: lastDutyDatePriority(input.priorLastDutyDates);
	const cellsByPersonnelId = new Map<string, Da6Cell[]>(input.pool.map((person) => [person.id, []]));
	const columns: Da6Column[] = [];
	const sequencePeriodCounters = new Map<DutyRosterSequenceKey, number>([
		['single', 0],
		['weekday', 0],
		['weekend-holiday', 0]
	]);
	const sequenceNumberByPerson = new Map<string, number>();
	const rosterRows: DutyRosterRunSnapshot['rosterRows'] = [];

	for (const date of input.dutyDates) {
		const { sequenceKind, sequenceKey } = getSequenceInfo(input, date);
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
			assigned
				? { date, assigneeId: assigned.id }
				: { date, assigneeId: null, reason: 'No eligible personnel available' }
		);

		if (assigned) {
			priority.recordSelection(assigned.id, date);
		}

		for (const person of input.pool) {
			const classification = classifications.get(person.id)!;
			const queuePosition = queuePositionByPersonnelId.get(person.id) ?? null;
			const isAssigned = assigned?.id === person.id;
			const sequenceBaseKey = `${sequenceKey}::${person.id}`;
			let sequenceNumber = sequenceNumberByPerson.get(sequenceBaseKey);
			if (sequenceNumber === undefined) {
				sequenceNumber = input.manualBaselineCounts.get(person.id);
			}
			if (sequenceNumber === undefined && queuePosition !== null) {
				sequenceNumber = 1;
			}
			cellsByPersonnelId
				.get(person.id)!
				.push(buildCell(person.id, date, classification, queuePosition, sequenceNumber ?? null, isAssigned));
			if (isAssigned) {
				sequenceNumberByPerson.set(sequenceBaseKey, 1);
			} else if (classification.chargeable && sequenceNumber !== undefined) {
				sequenceNumberByPerson.set(sequenceBaseKey, sequenceNumber + 1);
			} else if (sequenceNumber !== undefined) {
				sequenceNumberByPerson.set(sequenceBaseKey, sequenceNumber);
			}

			if (!isAssigned && classification.chargeable) {
				priority.recordPassedOver(person.id);
			}
		}

		sequencePeriodCounters.set(sequenceKey, sequencePeriodIndex + 1);
	}

	return { columns, rosterRows, cellsByPersonnelId };
}

export const __testing = {
	baselineCountPriority,
	lastDutyDatePriority
};
