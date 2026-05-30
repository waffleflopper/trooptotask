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
	const lastDutyDates = new Map(input.priorLastDutyDates);
	const selectionCounts =
		input.manualBaselineCounts.size > 0
			? new Map(input.pool.map((person) => [person.id, input.manualBaselineCounts.get(person.id) ?? 0]))
			: null;
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
		const rankedPersonnel = [...input.pool].sort((a, b) => {
			if (selectionCounts) {
				const countDiff = (selectionCounts.get(b.id) ?? 0) - (selectionCounts.get(a.id) ?? 0);
				if (countDiff !== 0) {
					return countDiff;
				}
				return comparePersonnelByRankThenName(a, b);
			}

			const lastDutyDiff = compareOldestFirst(lastDutyDates.get(a.id) ?? null, lastDutyDates.get(b.id) ?? null);
			if (lastDutyDiff !== 0) {
				return lastDutyDiff;
			}
			return comparePersonnelByRankThenName(a, b);
		});
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
			lastDutyDates.set(assigned.id, date);
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

			if (selectionCounts) {
				const currentCount = selectionCounts.get(person.id) ?? 0;
				if (isAssigned) {
					selectionCounts.set(person.id, 0);
				} else if (classification.chargeable) {
					selectionCounts.set(person.id, currentCount + 1);
				}
			}
		}

		sequencePeriodCounters.set(sequenceKey, sequencePeriodIndex + 1);
	}

	return { columns, rosterRows, cellsByPersonnelId };
}
