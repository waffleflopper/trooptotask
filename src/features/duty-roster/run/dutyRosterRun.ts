import { resolveSlotBlockingMode } from '$features/duty-roster/blockingMode';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
import type { Personnel, SpecialDay } from '$lib/types';
import { comparePersonnelByRankThenName } from '$lib/domain/personnelRank';
import type {
	Da6Cell,
	Da6CellCode,
	Da6Column,
	DutyRosterRunConfig,
	DutyRosterRunInput,
	DutyRosterRunSnapshot,
	DutyRosterSequenceKind,
	DutyRosterSnapshotPersonnel
} from './dutyRosterRun.types';

const DEFAULT_GENERATED_AT = '1970-01-01T00:00:00.000Z';

interface AvailabilityClassification {
	selectable: boolean;
	code: Da6CellCode;
	da6Code: Da6Cell['da6Code'];
	chargeable: boolean;
	reason: string | null;
	reasonCode: string | null;
}

function normalizeConfig(config: DutyRosterRunConfig): DutyRosterRunSnapshot['config'] {
	return {
		...config,
		excludedStatusIds: [...config.excludedStatusIds],
		exemptPersonnelIds: [...(config.exemptPersonnelIds ?? [])],
		numberingMode: config.numberingMode ?? 'single-sequence',
		misconductUnavailablePersonnelDates: Object.fromEntries(
			Object.entries(config.misconductUnavailablePersonnelDates ?? {}).map(([personnelId, dates]) => [
				personnelId,
				[...dates]
			])
		)
	};
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
		Object.freeze(value);
	}
	return value;
}

function clonePersonnel(person: Personnel): DutyRosterSnapshotPersonnel {
	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		groupId: person.groupId,
		groupName: person.groupName
	};
}

function formatDate(value: Date): string {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatDateTime(value: Date): string {
	const hours = String(value.getHours()).padStart(2, '0');
	const minutes = String(value.getMinutes()).padStart(2, '0');
	const seconds = String(value.getSeconds()).padStart(2, '0');
	return `${formatDate(value)}T${hours}:${minutes}:${seconds}`;
}

function addHours(dateTime: string, hours: number): string {
	const value = new Date(dateTime);
	value.setHours(value.getHours() + hours);
	return formatDateTime(value);
}

function buildDutyDates(config: DutyRosterRunSnapshot['config'], specialDays: SpecialDay[]): string[] {
	const dates: string[] = [];
	const start = new Date(`${config.startDate}T00:00:00`);
	const end = new Date(`${config.endDate}T00:00:00`);
	const excludedSpecialDays = new Set(
		specialDays
			.filter(
				(day) =>
					(config.excludeHolidays && day.type === 'federal-holiday') ||
					(config.excludeOrgClosures && day.type === 'org-closure')
			)
			.map((day) => day.date)
	);
	const current = new Date(start);

	while (current <= end) {
		const date = formatDate(current);
		const dayOfWeek = current.getDay();
		const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
		if (!(config.excludeWeekends && isWeekend) && !excludedSpecialDays.has(date)) {
			dates.push(date);
		}

		switch (config.dutyDuration) {
			case 'daily':
				current.setDate(current.getDate() + 1);
				break;
			case 'weekly':
				current.setDate(current.getDate() + 7);
				break;
			case 'monthly':
				current.setMonth(current.getMonth() + 1);
				break;
		}
	}

	return dates;
}

function classifySequenceKind(date: string, specialDays: SpecialDay[]): DutyRosterSequenceKind {
	const day = new Date(`${date}T00:00:00`).getDay();
	const isWeekend = day === 0 || day === 6;
	const hasSpecialDay = specialDays.some((specialDay) => specialDay.date === date);

	if (isWeekend && hasSpecialDay) {
		return 'weekend-holiday';
	}
	if (isWeekend) {
		return 'weekend';
	}
	if (hasSpecialDay) {
		return 'holiday';
	}
	return 'weekday';
}

function buildColumns(dates: string[], specialDays: SpecialDay[]): Da6Column[] {
	return dates.map((date) => ({
		date,
		sequenceKind: classifySequenceKind(date, specialDays),
		specialDayIds: specialDays.filter((day) => day.date === date).map((day) => day.id)
	}));
}

function getLastDutyDates(
	personnel: DutyRosterSnapshotPersonnel[],
	input: DutyRosterRunInput,
	startDate: string
): Map<string, string | null> {
	const dates = new Map<string, string | null>(personnel.map((person) => [person.id, null]));
	for (const assignment of input.assignments) {
		if (assignment.assignmentTypeId !== input.assignmentType.id || assignment.date >= startDate) {
			continue;
		}
		const current = dates.get(assignment.assigneeId);
		if (current === undefined) {
			continue;
		}
		if (current === null || assignment.date > current) {
			dates.set(assignment.assigneeId, assignment.date);
		}
	}
	return dates;
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

function isPersonInAdvancedDuty(event: DutyEvent, personnelId: string): boolean {
	return event.slotInstances.some((slot) => {
		if (slot.assigneeId !== personnelId) {
			return false;
		}
		const snapshotSlot = event.rulesSnapshot.slots.find(
			(candidate) => candidate.templateSlotId === slot.templateSlotId
		);
		return resolveSlotBlockingMode(event.isBlocking, snapshotSlot?.blockingMode);
	});
}

function getAdvancedDutyBlock(
	input: DutyRosterRunInput,
	personnelId: string,
	date: string
): 'duty' | 'cooldown' | null {
	const dayStart = `${date}T00:00:00`;
	const dayEnd = `${date}T23:59:59`;

	for (const event of input.advancedDutyEvents) {
		if (!isPersonInAdvancedDuty(event, personnelId)) {
			continue;
		}
		const overlaps = event.coverageStart < dayEnd && event.coverageEnd > dayStart;
		if (overlaps) {
			return 'duty';
		}
		const cooldownBlocks = event.coverageEnd <= dayStart && addHours(event.coverageEnd, event.cooldownHours) > dayStart;
		if (cooldownBlocks) {
			return 'cooldown';
		}
	}

	return null;
}

function classifyAvailability(
	personnelId: string,
	date: string,
	input: DutyRosterRunInput,
	config: DutyRosterRunSnapshot['config']
): AvailabilityClassification {
	if (config.misconductUnavailablePersonnelDates[personnelId]?.includes(date)) {
		return {
			selectable: false,
			code: 'misconduct-unavailable',
			da6Code: 'U',
			chargeable: true,
			reason: 'Unavailable due to misconduct/AWOL-style status',
			reasonCode: 'misconduct-unavailable'
		};
	}

	const advancedDutyBlock = getAdvancedDutyBlock(input, personnelId, date);
	if (advancedDutyBlock) {
		return {
			selectable: false,
			code: advancedDutyBlock === 'duty' ? 'blocked-by-duty' : 'blocked-by-cooldown',
			da6Code: 'D',
			chargeable: true,
			reason:
				advancedDutyBlock === 'duty'
					? 'Assigned to blocking advanced duty coverage'
					: 'In cooldown from blocking advanced duty coverage',
			reasonCode: advancedDutyBlock === 'duty' ? 'advanced-duty-overlap' : 'advanced-duty-cooldown'
		};
	}

	const statusEntry = input.availabilityEntries.find(
		(entry) =>
			entry.personnelId === personnelId &&
			date >= entry.startDate &&
			date <= entry.endDate &&
			config.excludedStatusIds.includes(entry.statusTypeId)
	);
	if (statusEntry) {
		const statusName = input.statusTypes.find((status) => status.id === statusEntry.statusTypeId)?.name ?? 'status';
		return {
			selectable: false,
			code: 'authorized-absence',
			da6Code: 'A',
			chargeable: false,
			reason: `Authorized absence: ${statusName}`,
			reasonCode: 'authorized-absence'
		};
	}

	return {
		selectable: true,
		code: 'available-not-selected',
		da6Code: null,
		chargeable: true,
		reason: null,
		reasonCode: null
	};
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

export function buildDutyRosterRunSnapshot(input: DutyRosterRunInput): DutyRosterRunSnapshot {
	const config = normalizeConfig(input.config);
	const exemptIds = new Set([...input.assignmentType.exemptPersonnelIds, ...config.exemptPersonnelIds]);
	const personnel = input.personnel
		.filter((person) => !exemptIds.has(person.id))
		.map(clonePersonnel)
		.sort(comparePersonnelByRankThenName);
	const dutyDates = buildDutyDates(config, input.specialDays);
	const lastDutyDates = getLastDutyDates(personnel, input, config.startDate);
	const cellsByPersonnelId = new Map<string, Da6Cell[]>(personnel.map((person) => [person.id, []]));
	const rosterRows: DutyRosterRunSnapshot['rosterRows'] = [];

	for (const date of dutyDates) {
		const classifications = new Map(
			personnel.map((person) => [person.id, classifyAvailability(person.id, date, input, config)])
		);
		const rankedPersonnel = [...personnel].sort((a, b) => {
			const lastDutyDiff = compareOldestFirst(lastDutyDates.get(a.id) ?? null, lastDutyDates.get(b.id) ?? null);
			if (lastDutyDiff !== 0) {
				return lastDutyDiff;
			}
			return comparePersonnelByRankThenName(a, b);
		});
		const queue = rankedPersonnel.filter((person) => classifications.get(person.id)?.chargeable);
		const assigned = rankedPersonnel.find((person) => classifications.get(person.id)?.selectable) ?? null;

		rosterRows.push(
			assigned
				? { date, assigneeId: assigned.id }
				: { date, assigneeId: null, reason: 'No eligible personnel available' }
		);

		if (assigned) {
			lastDutyDates.set(assigned.id, date);
		}

		for (const person of personnel) {
			const classification = classifications.get(person.id)!;
			const queueIndex = queue.findIndex((candidate) => candidate.id === person.id);
			const queuePosition = queueIndex === -1 ? null : queueIndex + 1;
			const isAssigned = assigned?.id === person.id;
			cellsByPersonnelId
				.get(person.id)!
				.push(buildCell(person.id, date, classification, queuePosition, queuePosition, isAssigned));
		}
	}

	const da6 = {
		numberingMode: config.numberingMode,
		columns: buildColumns(dutyDates, input.specialDays),
		rows: personnel.map((person) => ({
			personnelId: person.id,
			display: { ...person },
			cells: cellsByPersonnelId.get(person.id) ?? []
		}))
	};
	const assignmentType = {
		id: input.assignmentType.id,
		name: input.assignmentType.name,
		shortName: input.assignmentType.shortName,
		color: input.assignmentType.color
	};
	const snapshot: DutyRosterRunSnapshot = {
		generatedAt: input.generatedAt ?? DEFAULT_GENERATED_AT,
		assignmentType,
		config,
		personnel,
		rosterRows,
		da6,
		exportModel: {
			assignmentType,
			startDate: config.startDate,
			endDate: config.endDate,
			rosterRows,
			da6
		},
		warnings: []
	};

	return deepFreeze(snapshot);
}
