import { resolveSlotBlockingMode } from '$features/duty-roster/blockingMode';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
import type { Da6AvailabilityTreatment, Personnel, SpecialDay, StatusType } from '$lib/types';
import { comparePersonnelByCatalogRankThenName } from '$lib/domain/personnelRank';
import { computeDa6Roster } from './da6RosterEngine';
import type { AvailabilityClassification, Da6RosterEngineInput, Da6RosterEngineRow } from './da6RosterEngine';
import { da6ReasonText } from './da6ReasonText';
import type {
	Da6Cell,
	Da6Column,
	DutyRosterApplyPayloadRow,
	DutyRosterExportModel,
	DutyRosterExportSequencePeriod,
	DutyRosterHistoryDa6Data,
	DutyRosterHistoryPayload,
	DutyRosterRow,
	DutyRosterRunConfig,
	DutyRosterRunInput,
	DutyRosterRunSnapshot,
	DutyRosterSequenceKey,
	DutyRosterSequenceKind,
	DutyRosterSnapshotPersonnel
} from './dutyRosterRun.types';

const DEFAULT_GENERATED_AT = '1970-01-01T00:00:00.000Z';
const DA6_TREATMENT_PRIORITY: Record<Da6AvailabilityTreatment, number> = {
	'misconduct-unavailable': 3,
	'authorized-absence': 2,
	'other-duty': 1
};

interface DutyRosterRunIndexes {
	availabilityByPersonDate: Map<string, Map<string, DutyRosterRunInput['availabilityEntries']>>;
	advancedDutyBlockByPersonDate: Map<string, Map<string, 'duty' | 'cooldown'>>;
	misconductUnavailableByPersonDate: Map<string, Set<string>>;
	statusTypeById: Map<string, StatusType>;
	specialDaysByDate: Map<string, SpecialDay[]>;
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
	return [...new Set((values ?? []).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6))].sort(
		(a, b) => a - b
	);
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

function buildDutyDates(
	config: DutyRosterRunSnapshot['config'],
	specialDays: SpecialDay[],
	specialDaysByDate: Map<string, SpecialDay[]> = buildSpecialDaysByDate(specialDays)
): string[] {
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
				specialDaysByDate
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
	specialDaysByDate: Map<string, SpecialDay[]>;
}): boolean {
	switch (input.pattern) {
		case 'weekday-only':
			return !input.isWeekend;
		case 'weekend-only':
			return input.isWeekend;
		case 'selected-weekdays':
			return input.selectedWeekdays.includes(input.dayOfWeek);
		case 'holiday-closure-only':
			return (input.specialDaysByDate.get(input.date)?.length ?? 0) > 0;
		case 'custom-dates':
		case 'daily':
			return true;
	}
}

function buildSpecialDaysByDate(specialDays: SpecialDay[]): Map<string, SpecialDay[]> {
	const specialDaysByDate = new Map<string, SpecialDay[]>();
	for (const specialDay of specialDays) {
		const days = specialDaysByDate.get(specialDay.date) ?? [];
		days.push(specialDay);
		specialDaysByDate.set(specialDay.date, days);
	}
	return specialDaysByDate;
}

function classifySequenceKind(date: string, specialDaysByDate: Map<string, SpecialDay[]>): DutyRosterSequenceKind {
	const day = dateOnlyUtc(date).getUTCDay();
	const isWeekend = day === 0 || day === 6;
	const hasSpecialDay = (specialDaysByDate.get(date)?.length ?? 0) > 0;

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

function getInitialDa6Counts(input: DutyRosterRunInput): Map<string, Map<DutyRosterSequenceKey, number>> {
	const counts = new Map<string, Map<DutyRosterSequenceKey, number>>();
	for (const historyItem of input.rosterHistory ?? []) {
		if (historyItem.assignmentTypeId !== input.assignmentType.id) {
			continue;
		}
		applyManualBaselineCounts(counts, historyItem.config.manualBaselineCounts);
		applyDa6ContinuationCounts(counts, historyItem.config.da6ContinuationCounts);
	}
	return counts;
}

function applyManualBaselineCounts(counts: Map<string, Map<DutyRosterSequenceKey, number>>, rawCounts: unknown): void {
	if (!rawCounts || typeof rawCounts !== 'object' || Array.isArray(rawCounts)) {
		return;
	}
	for (const [personnelId, count] of Object.entries(rawCounts)) {
		if (typeof count === 'number' && Number.isInteger(count) && count > 0) {
			counts.set(personnelId, new Map([['single', count]]));
		}
	}
}

function applyDa6ContinuationCounts(counts: Map<string, Map<DutyRosterSequenceKey, number>>, rawCounts: unknown): void {
	if (!rawCounts || typeof rawCounts !== 'object' || Array.isArray(rawCounts)) {
		return;
	}
	for (const [personnelId, rawSequenceCounts] of Object.entries(rawCounts)) {
		if (!rawSequenceCounts || typeof rawSequenceCounts !== 'object' || Array.isArray(rawSequenceCounts)) {
			continue;
		}
		const sequenceCounts = new Map<DutyRosterSequenceKey, number>();
		for (const sequenceKey of ['single', 'weekday', 'weekend-holiday'] as const) {
			const count = (rawSequenceCounts as Record<string, unknown>)[sequenceKey];
			if (typeof count === 'number' && Number.isInteger(count) && count > 0) {
				sequenceCounts.set(sequenceKey, count);
			}
		}
		if (sequenceCounts.size > 0) {
			const existingCounts = counts.get(personnelId) ?? new Map<DutyRosterSequenceKey, number>();
			for (const [sequenceKey, count] of sequenceCounts) {
				existingCounts.set(sequenceKey, count);
			}
			counts.set(personnelId, existingCounts);
		}
	}
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

function getAdvancedDutyBlockFromIndex(
	indexes: DutyRosterRunIndexes,
	personnelId: string,
	date: string
): 'duty' | 'cooldown' | null {
	return indexes.advancedDutyBlockByPersonDate.get(personnelId)?.get(date) ?? null;
}

function getEventAdvancedDutyBlock(event: DutyEvent, date: string): 'duty' | 'cooldown' | null {
	const dayStart = `${date}T00:00:00`;
	const dayEnd = `${date}T23:59:59`;
	const overlaps = event.coverageStart < dayEnd && event.coverageEnd > dayStart;
	if (overlaps) {
		return 'duty';
	}
	const cooldownBlocks = event.coverageEnd <= dayStart && addHours(event.coverageEnd, event.cooldownHours) > dayStart;
	return cooldownBlocks ? 'cooldown' : null;
}

function higherPriorityAdvancedDutyBlock(
	current: 'duty' | 'cooldown' | null,
	next: 'duty' | 'cooldown'
): 'duty' | 'cooldown' {
	if (next === 'duty' || current === 'duty') return 'duty';
	return current ?? next;
}

function collectBlockingPersonnelIds(event: DutyEvent): string[] {
	const ids = new Set<string>();
	for (const slot of event.slotInstances) {
		if (!slot.assigneeId) {
			continue;
		}
		const snapshotSlot = event.rulesSnapshot.slots.find(
			(candidate) => candidate.templateSlotId === slot.templateSlotId
		);
		if (resolveSlotBlockingMode(event.isBlocking, snapshotSlot?.blockingMode)) {
			ids.add(slot.assigneeId);
		}
	}
	return [...ids];
}

function buildAdvancedDutyBlockIndex(
	events: DutyEvent[],
	dutyDates: string[]
): DutyRosterRunIndexes['advancedDutyBlockByPersonDate'] {
	const blockByPersonDate = new Map<string, Map<string, 'duty' | 'cooldown'>>();
	for (const event of events) {
		for (const personnelId of collectBlockingPersonnelIds(event)) {
			let dateBlocks = blockByPersonDate.get(personnelId);
			if (!dateBlocks) {
				dateBlocks = new Map();
				blockByPersonDate.set(personnelId, dateBlocks);
			}
			for (const date of dutyDates) {
				const block = getEventAdvancedDutyBlock(event, date);
				if (!block) {
					continue;
				}
				dateBlocks.set(date, higherPriorityAdvancedDutyBlock(dateBlocks.get(date) ?? null, block));
			}
		}
	}
	return blockByPersonDate;
}

function buildAvailabilityIndex(
	input: DutyRosterRunInput,
	dutyDates: string[]
): DutyRosterRunIndexes['availabilityByPersonDate'] {
	const byPersonDate = new Map<string, Map<string, DutyRosterRunInput['availabilityEntries']>>();
	const dutyDateSet = new Set(dutyDates);
	const firstDutyDate = dutyDates[0];
	const lastDutyDate = dutyDates.at(-1);
	for (const entry of input.availabilityEntries) {
		if (!firstDutyDate || !lastDutyDate || entry.endDate < firstDutyDate || entry.startDate > lastDutyDate) {
			continue;
		}
		const startDate = entry.startDate > firstDutyDate ? entry.startDate : firstDutyDate;
		const endDate = entry.endDate < lastDutyDate ? entry.endDate : lastDutyDate;
		const current = dateOnlyUtc(startDate);
		const end = dateOnlyUtc(endDate);
		while (current <= end) {
			const date = formatDateOnlyUtc(current);
			if (!dutyDateSet.has(date)) {
				current.setUTCDate(current.getUTCDate() + 1);
				continue;
			}
			let byDate = byPersonDate.get(entry.personnelId);
			if (!byDate) {
				byDate = new Map();
				byPersonDate.set(entry.personnelId, byDate);
			}
			const entries = byDate.get(date) ?? [];
			entries.push(entry);
			byDate.set(date, entries);
			current.setUTCDate(current.getUTCDate() + 1);
		}
	}
	return byPersonDate;
}

function buildMisconductUnavailableIndex(
	config: DutyRosterRunSnapshot['config']
): DutyRosterRunIndexes['misconductUnavailableByPersonDate'] {
	return new Map(
		Object.entries(config.misconductUnavailablePersonnelDates).map(([personnelId, dates]) => [
			personnelId,
			new Set(dates)
		])
	);
}

function buildRunIndexes(
	input: DutyRosterRunInput,
	config: DutyRosterRunSnapshot['config'],
	dutyDates: string[],
	specialDaysByDate: Map<string, SpecialDay[]>
): DutyRosterRunIndexes {
	return {
		availabilityByPersonDate: buildAvailabilityIndex(input, dutyDates),
		advancedDutyBlockByPersonDate: buildAdvancedDutyBlockIndex(input.advancedDutyEvents, dutyDates),
		misconductUnavailableByPersonDate: buildMisconductUnavailableIndex(config),
		statusTypeById: new Map(input.statusTypes.map((statusType) => [statusType.id, statusType])),
		specialDaysByDate
	};
}

function highestPriorityDa6TreatmentFromIndex(
	statusTypeById: Map<string, StatusType>,
	statusTypeIds: Iterable<string>
): Da6AvailabilityTreatment | null {
	let selected: Da6AvailabilityTreatment | null = null;
	for (const statusTypeId of statusTypeIds) {
		const treatment = statusTypeById.get(statusTypeId)?.da6AvailabilityTreatment ?? null;
		if (!treatment) {
			continue;
		}
		if (!selected || DA6_TREATMENT_PRIORITY[treatment] > DA6_TREATMENT_PRIORITY[selected]) {
			selected = treatment;
		}
	}
	return selected;
}

function getAdvancedDutyBlock(
	input: DutyRosterRunInput,
	personnelId: string,
	date: string
): 'duty' | 'cooldown' | null {
	let selectedBlock: 'duty' | 'cooldown' | null = null;
	for (const event of input.advancedDutyEvents) {
		if (!isPersonInAdvancedDuty(event, personnelId)) {
			continue;
		}
		const block = getEventAdvancedDutyBlock(event, date);
		if (block) {
			selectedBlock = higherPriorityAdvancedDutyBlock(selectedBlock, block);
		}
	}

	return selectedBlock;
}

function classifyAvailability(
	personnelId: string,
	date: string,
	input: DutyRosterRunInput,
	config: DutyRosterRunSnapshot['config'],
	indexes?: DutyRosterRunIndexes
): AvailabilityClassification {
	const statusEntries = indexes
		? (indexes.availabilityByPersonDate.get(personnelId)?.get(date) ?? [])
		: input.availabilityEntries.filter(
				(entry) => entry.personnelId === personnelId && date >= entry.startDate && date <= entry.endDate
			);
	const statusTypeById =
		indexes?.statusTypeById ?? new Map(input.statusTypes.map((statusType) => [statusType.id, statusType]));
	const statusTreatment = highestPriorityDa6TreatmentFromIndex(
		statusTypeById,
		statusEntries.map((entry) => entry.statusTypeId)
	);
	const statusNames = statusEntries
		.filter((entry) => {
			const statusType = statusTypeById.get(entry.statusTypeId);
			return statusType?.da6AvailabilityTreatment === statusTreatment;
		})
		.map((entry) => statusTypeById.get(entry.statusTypeId)?.name)
		.filter((name): name is string => Boolean(name));

	const isMisconductUnavailable = indexes
		? (indexes.misconductUnavailableByPersonDate.get(personnelId)?.has(date) ?? false)
		: (config.misconductUnavailablePersonnelDates[personnelId]?.includes(date) ?? false);
	if (isMisconductUnavailable) {
		return {
			selectable: false,
			code: 'misconduct-unavailable',
			da6Code: 'U',
			chargeable: true,
			reasonCode: 'misconduct-unavailable'
		};
	}

	if (statusTreatment === 'misconduct-unavailable') {
		return {
			selectable: false,
			code: 'misconduct-unavailable',
			da6Code: 'U',
			chargeable: true,
			reasonCode: 'misconduct-unavailable',
			reasonParams: { statusNames }
		};
	}

	if (statusTreatment === 'authorized-absence') {
		return {
			selectable: false,
			code: 'authorized-absence',
			da6Code: 'A',
			chargeable: false,
			reasonCode: 'authorized-absence',
			reasonParams: { statusNames }
		};
	}

	const advancedDutyBlock = indexes
		? getAdvancedDutyBlockFromIndex(indexes, personnelId, date)
		: getAdvancedDutyBlock(input, personnelId, date);
	if (advancedDutyBlock) {
		return {
			selectable: false,
			code: advancedDutyBlock === 'duty' ? 'blocked-by-duty' : 'blocked-by-cooldown',
			da6Code: 'D',
			chargeable: true,
			reasonCode: advancedDutyBlock === 'duty' ? 'advanced-duty-overlap' : 'advanced-duty-cooldown'
		};
	}

	if (statusTreatment === 'other-duty') {
		return {
			selectable: false,
			code: 'blocked-by-duty',
			da6Code: 'D',
			chargeable: true,
			reasonCode: 'other-duty-status',
			reasonParams: { statusNames }
		};
	}

	return {
		selectable: true,
		code: 'available-not-selected',
		da6Code: null,
		chargeable: true,
		reasonCode: null
	};
}

function renderRosterRowReason(row: Da6RosterEngineRow): DutyRosterRow {
	const reason = da6ReasonText(row.reasonCode, row.reasonParams);
	return reason
		? {
				date: row.date,
				assigneeId: row.assigneeId,
				reason
			}
		: {
				date: row.date,
				assigneeId: row.assigneeId
			};
}

function renderDa6CellReason(cell: Da6Cell): Da6Cell {
	const { reasonParams, ...cellWithoutReasonParams } = cell;
	return {
		...cellWithoutReasonParams,
		reason: da6ReasonText(cell.reasonCode, reasonParams)
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
		.sort((left, right) => comparePersonnelByCatalogRankThenName(left, right, input.rankCatalog));
	const specialDaysByDate = buildSpecialDaysByDate(input.specialDays);
	const dutyDates = buildDutyDates(config, input.specialDays, specialDaysByDate);
	const indexes = buildRunIndexes(input, config, dutyDates, specialDaysByDate);
	const manualBaselineCounts = getManualBaselineCounts(input);
	const initialDa6Counts = getInitialDa6Counts(input);
	const sequenceByDate: Da6RosterEngineInput['sequenceByDate'] = new Map(
		dutyDates.map((date) => {
			const sequenceKind = classifySequenceKind(date, indexes.specialDaysByDate);
			const sequenceKey = getSequenceKey(config.numberingMode, sequenceKind);
			return [date, { sequenceKind, sequenceKey }];
		})
	);
	const classificationByPersonDate: Da6RosterEngineInput['classificationByPersonDate'] = new Map(
		personnel.map((person) => [
			person.id,
			new Map(dutyDates.map((date) => [date, classifyAvailability(person.id, date, input, config, indexes)]))
		])
	);
	const engineOutput = computeDa6Roster({
		pool: personnel,
		rankCatalog: input.rankCatalog,
		dutyDates,
		sequenceByDate,
		classificationByPersonDate,
		priorLastDutyDates: getLastDutyDates(personnel, input, config.startDate),
		manualBaselineCounts,
		initialDa6Counts
	});
	const columns = engineOutput.columns.map((column) => ({
		...column,
		specialDayIds: (indexes.specialDaysByDate.get(column.date) ?? []).map((day) => day.id)
	}));
	const rosterRows = engineOutput.rosterRows.map(renderRosterRowReason);
	const cellsByPersonnelId = new Map(
		[...engineOutput.cellsByPersonnelId].map(([personnelId, cells]) => [personnelId, cells.map(renderDa6CellReason)])
	);

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
