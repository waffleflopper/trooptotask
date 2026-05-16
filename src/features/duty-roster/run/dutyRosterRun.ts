import { resolveSlotBlockingMode } from '$features/duty-roster/blockingMode';
import { highestPriorityDa6Treatment } from '$features/calendar/utils/da6AvailabilityTreatment';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
import type { Personnel, SpecialDay } from '$lib/types';
import { comparePersonnelByRankThenName } from '$lib/domain/personnelRank';
import type {
	Da6Cell,
	Da6CellCode,
	Da6Column,
	DutyRosterApplyPayloadRow,
	DutyRosterExportModel,
	DutyRosterExportSequencePeriod,
	DutyRosterHistoryDa6Data,
	DutyRosterHistoryPayload,
	DutyRosterRunConfig,
	DutyRosterRunInput,
	DutyRosterRunSnapshot,
	DutyRosterSequenceKey,
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
	const pattern = config.pattern ?? (config.excludeWeekends ? 'weekday-only' : 'daily');
	return {
		...config,
		pattern,
		selectedWeekdays: normalizeSelectedWeekdays(config.selectedWeekdays),
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

function normalizeSelectedWeekdays(values: number[] | undefined): number[] {
	return [
		...new Set((values ?? []).map((value) => Math.trunc(value)).filter((value) => value >= 0 && value <= 6))
	].sort((a, b) => a - b);
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

function formatLocalDate(value: Date): string {
	const year = value.getFullYear();
	const month = String(value.getMonth() + 1).padStart(2, '0');
	const day = String(value.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function formatDateTime(value: Date): string {
	const hours = String(value.getHours()).padStart(2, '0');
	const minutes = String(value.getMinutes()).padStart(2, '0');
	const seconds = String(value.getSeconds()).padStart(2, '0');
	return `${formatLocalDate(value)}T${hours}:${minutes}:${seconds}`;
}

function addHours(dateTime: string, hours: number): string {
	const value = new Date(dateTime);
	value.setHours(value.getHours() + hours);
	return formatDateTime(value);
}

function dateOnlyUtc(value: string): Date {
	const [year, month, day] = value.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnlyUtc(value: Date): string {
	const year = value.getUTCFullYear();
	const month = String(value.getUTCMonth() + 1).padStart(2, '0');
	const day = String(value.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function addUtcMonthsPreservingAnchor(value: Date, months: number, anchorDay: number): Date {
	const next = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
	const lastDayOfMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
	next.setUTCDate(Math.min(anchorDay, lastDayOfMonth));
	return next;
}

function buildDutyDates(config: DutyRosterRunSnapshot['config'], specialDays: SpecialDay[]): string[] {
	const dates: string[] = [];
	const start = dateOnlyUtc(config.startDate);
	const end = dateOnlyUtc(config.endDate);
	const monthlyAnchorDay = start.getUTCDate();
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
		const date = formatDateOnlyUtc(current);
		const dayOfWeek = current.getUTCDay();
		const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
		if (
			dateMatchesPattern({
				date,
				dayOfWeek,
				isWeekend,
				pattern: config.pattern,
				selectedWeekdays: config.selectedWeekdays,
				specialDays
			}) &&
			!(config.excludeWeekends && isWeekend) &&
			!excludedSpecialDays.has(date)
		) {
			dates.push(date);
		}

		switch (config.dutyDuration) {
			case 'daily':
				current.setUTCDate(current.getUTCDate() + 1);
				break;
			case 'weekly':
				current.setUTCDate(current.getUTCDate() + 7);
				break;
			case 'monthly':
				current.setTime(addUtcMonthsPreservingAnchor(current, 1, monthlyAnchorDay).getTime());
				break;
		}
	}

	return dates;
}

function dateMatchesPattern(input: {
	date: string;
	dayOfWeek: number;
	isWeekend: boolean;
	pattern: DutyRosterRunSnapshot['config']['pattern'];
	selectedWeekdays: number[];
	specialDays: SpecialDay[];
}): boolean {
	switch (input.pattern) {
		case 'weekday-only':
			return !input.isWeekend;
		case 'weekend-only':
			return input.isWeekend;
		case 'selected-weekdays':
			return input.selectedWeekdays.includes(input.dayOfWeek);
		case 'holiday-closure-only':
			return input.specialDays.some((day) => day.date === input.date);
		case 'custom-dates':
		case 'daily':
			return true;
	}
}

function classifySequenceKind(date: string, specialDays: SpecialDay[]): DutyRosterSequenceKind {
	const day = dateOnlyUtc(date).getUTCDay();
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

function getSequenceKey(
	numberingMode: DutyRosterRunSnapshot['config']['numberingMode'],
	sequenceKind: DutyRosterSequenceKind
): DutyRosterSequenceKey {
	if (numberingMode === 'single-sequence') {
		return 'single';
	}
	return sequenceKind === 'weekday' ? 'weekday' : 'weekend-holiday';
}

function buildExportSequencePeriods(columns: Da6Column[]): DutyRosterExportSequencePeriod[] {
	return columns.map((column) => ({
		date: column.date,
		sequenceKind: column.sequenceKind,
		sequenceKey: column.sequenceKey,
		isWeekendOrHoliday: column.sequenceKey === 'weekend-holiday',
		specialDayIds: [...column.specialDayIds]
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
	for (const historyItem of input.rosterHistory ?? []) {
		if (historyItem.assignmentTypeId !== input.assignmentType.id) {
			continue;
		}
		for (const row of historyItem.roster) {
			if (!row.assigneeId || row.date >= startDate) {
				continue;
			}
			const current = dates.get(row.assigneeId);
			if (current === undefined) {
				continue;
			}
			if (current === null || row.date > current) {
				dates.set(row.assigneeId, row.date);
			}
		}
	}
	return dates;
}

function getManualBaselineCounts(input: DutyRosterRunInput): Map<string, number> {
	const counts = new Map<string, number>();
	for (const historyItem of input.rosterHistory ?? []) {
		if (historyItem.assignmentTypeId !== input.assignmentType.id) {
			continue;
		}
		const rawCounts = historyItem.config.manualBaselineCounts;
		if (!rawCounts || typeof rawCounts !== 'object' || Array.isArray(rawCounts)) {
			continue;
		}
		for (const [personnelId, count] of Object.entries(rawCounts)) {
			if (typeof count === 'number' && Number.isInteger(count) && count > 0) {
				counts.set(personnelId, count);
			}
		}
	}
	return counts;
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
	const statusEntries = input.availabilityEntries.filter(
		(entry) => entry.personnelId === personnelId && date >= entry.startDate && date <= entry.endDate
	);
	const statusTreatment = highestPriorityDa6Treatment(
		input.statusTypes,
		statusEntries.map((entry) => entry.statusTypeId)
	);
	const statusNames = statusEntries
		.filter((entry) => {
			const statusType = input.statusTypes.find((status) => status.id === entry.statusTypeId);
			return statusType?.da6AvailabilityTreatment === statusTreatment;
		})
		.map((entry) => input.statusTypes.find((status) => status.id === entry.statusTypeId)?.name)
		.filter((name): name is string => Boolean(name));

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

	if (statusTreatment === 'misconduct-unavailable') {
		return {
			selectable: false,
			code: 'misconduct-unavailable',
			da6Code: 'U',
			chargeable: true,
			reason: `Misconduct unavailable: ${statusNames.join(', ') || 'status'}`,
			reasonCode: 'misconduct-unavailable'
		};
	}

	if (statusTreatment === 'authorized-absence') {
		return {
			selectable: false,
			code: 'authorized-absence',
			da6Code: 'A',
			chargeable: false,
			reason: `Authorized absence: ${statusNames.join(', ') || 'status'}`,
			reasonCode: 'authorized-absence'
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

	if (statusTreatment === 'other-duty') {
		return {
			selectable: false,
			code: 'blocked-by-duty',
			da6Code: 'D',
			chargeable: true,
			reason: `Other duty: ${statusNames.join(', ') || 'status'}`,
			reasonCode: 'other-duty-status'
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

function formatDisplayDate(date: string): string {
	return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

export function buildDutyRosterApplyPayload(snapshot: DutyRosterRunSnapshot): DutyRosterApplyPayloadRow[] {
	return snapshot.rosterRows
		.filter((row) => row.assigneeId !== null)
		.map((row) => ({
			date: row.date,
			assignmentTypeId: snapshot.assignmentType.id,
			assigneeId: row.assigneeId!
		}));
}

export function buildDutyRosterHistoryDa6Data(snapshot: DutyRosterRunSnapshot): DutyRosterHistoryDa6Data {
	return {
		personnel: snapshot.da6.rows.map((row) => ({
			id: row.personnelId,
			name: `${row.display.lastName}, ${row.display.firstName}`,
			rank: row.display.rank,
			group: row.display.groupName
		})),
		dates: snapshot.da6.columns.map((column, columnIndex) => ({
			date: column.date,
			positions: snapshot.da6.rows.map((row) => {
				const cell = row.cells[columnIndex];
				if (!cell) return null;
				return cell.queuePosition;
			}),
			assigned: snapshot.da6.rows.map((row) => Boolean(row.cells[columnIndex]?.assigned))
		}))
	};
}

export function buildDutyRosterHistoryPayload(snapshot: DutyRosterRunSnapshot): DutyRosterHistoryPayload {
	const personnelById = new Map(snapshot.personnel.map((person) => [person.id, person]));
	return {
		assignmentTypeId: snapshot.assignmentType.id,
		name: `${snapshot.assignmentType.name} – ${formatDisplayDate(snapshot.config.startDate)} to ${formatDisplayDate(snapshot.config.endDate)}`,
		startDate: snapshot.config.startDate,
		endDate: snapshot.config.endDate,
		roster: snapshot.rosterRows.map((row) => {
			const assignee = row.assigneeId ? (personnelById.get(row.assigneeId) ?? null) : null;
			return {
				date: row.date,
				assigneeId: row.assigneeId,
				assigneeName: assignee ? `${assignee.lastName}, ${assignee.firstName}` : null,
				assigneeRank: assignee?.rank ?? null,
				assigneeGroup: assignee?.groupName ?? null,
				reason: row.reason
			};
		}),
		da6: buildDutyRosterHistoryDa6Data(snapshot),
		config: {
			dutyDuration: snapshot.config.dutyDuration,
			pattern: snapshot.config.pattern,
			selectedWeekdays: [...snapshot.config.selectedWeekdays],
			assignmentTypeName: snapshot.assignmentType.name,
			exemptPersonnelIds: [...snapshot.config.exemptPersonnelIds],
			excludeStatuses: [...snapshot.config.excludedStatusIds],
			excludeWeekends: snapshot.config.excludeWeekends,
			excludeHolidays: snapshot.config.excludeHolidays,
			excludeOrgClosures: snapshot.config.excludeOrgClosures
		}
	};
}

export function buildDutyRosterExportModel(snapshot: DutyRosterRunSnapshot): DutyRosterExportModel {
	return snapshot.exportModel;
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
	const manualBaselineCounts = getManualBaselineCounts(input);
	const selectionCounts =
		manualBaselineCounts.size > 0
			? new Map(personnel.map((person) => [person.id, manualBaselineCounts.get(person.id) ?? 0]))
			: null;
	const cellsByPersonnelId = new Map<string, Da6Cell[]>(personnel.map((person) => [person.id, []]));
	const columns: Da6Column[] = [];
	const sequencePeriodCounters = new Map<DutyRosterSequenceKey, number>([
		['single', 0],
		['weekday', 0],
		['weekend-holiday', 0]
	]);
	const sequenceNumberByPerson = new Map<string, number>();
	const rosterRows: DutyRosterRunSnapshot['rosterRows'] = [];

	for (const date of dutyDates) {
		const sequenceKind = classifySequenceKind(date, input.specialDays);
		const sequenceKey = getSequenceKey(config.numberingMode, sequenceKind);
		const classifications = new Map(
			personnel.map((person) => [person.id, classifyAvailability(person.id, date, input, config)])
		);
		const rankedPersonnel = [...personnel].sort((a, b) => {
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

		columns.push({
			date,
			sequenceKind,
			sequenceKey,
			specialDayIds: input.specialDays.filter((day) => day.date === date).map((day) => day.id),
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

		for (const person of personnel) {
			const classification = classifications.get(person.id)!;
			const queueIndex = queue.findIndex((candidate) => candidate.id === person.id);
			const queuePosition = queueIndex === -1 ? null : queueIndex + 1;
			const isAssigned = assigned?.id === person.id;
			const sequenceBaseKey = `${sequenceKey}::${person.id}`;
			let sequenceNumber = sequenceNumberByPerson.get(sequenceBaseKey);
			if (sequenceNumber === undefined) {
				sequenceNumber = manualBaselineCounts.get(person.id);
			}
			if (sequenceNumber === undefined && queuePosition !== null) {
				sequenceNumber = queuePosition;
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

	const da6 = {
		numberingMode: config.numberingMode,
		columns,
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
			numberingMode: config.numberingMode,
			rosterRows,
			da6,
			sequencePeriods: buildExportSequencePeriods(columns)
		},
		warnings: []
	};

	return deepFreeze(snapshot);
}
