import type { Group } from '$lib/stores/groups.svelte';
import type { UpcomingLossRecord } from '$lib/domain/readinessSignals';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import { formatDate, getDayName, isToday, isWeekend } from '$lib/utils/dates';

export type CalendarDateKey = string;

export interface CalendarRenderStateInput {
	dates: readonly Date[];
	personnelByGroup: readonly { group: string; personnel: readonly Personnel[] }[];
	availabilityEntries: readonly AvailabilityEntry[];
	statusTypes: readonly StatusType[];
	specialDays: readonly SpecialDay[];
	assignmentTypes: readonly AssignmentType[];
	assignments: readonly DailyAssignment[];
	groups?: readonly Group[];
	activeOnboardingPersonnelIds?: readonly string[];
	highlightOnboarding?: boolean;
	upcomingLossMap?: ReadonlyMap<string, UpcomingLossRecord>;
}

export interface CalendarHeaderAssignmentState {
	assignmentTypeName: string;
	assigneeLabel: string;
}

export interface CalendarDateHeaderState {
	date: Date;
	dateKey: CalendarDateKey;
	dayName: string;
	dayOfMonth: number;
	weekend: boolean;
	today: boolean;
	specialDay?: SpecialDay;
	holiday: boolean;
	holidayName?: string;
	headerAssignment?: CalendarHeaderAssignmentState;
	title: string;
}

export interface CalendarCellStatusState {
	id: string;
	name: string;
	color: string;
	textColor?: string;
	note?: string;
}

export interface CalendarCellMarkerState {
	id: string;
	name: string;
	shortName: string;
	color: string;
	textColor?: string;
	title?: string;
}

export interface CalendarPersonDateCellState {
	personnelId: string;
	date: Date;
	dateKey: CalendarDateKey;
	weekend: boolean;
	today: boolean;
	specialDay?: SpecialDay;
	holiday: boolean;
	holidayName?: string;
	statuses: CalendarCellStatusState[];
	primaryStatus?: CalendarCellStatusState;
	markers: CalendarCellMarkerState[];
	onboarding: boolean;
	title: string;
	titleParts: string[];
}

export interface CalendarPersonHeaderState {
	personnelId: string;
	isOnboarding: boolean;
	highlightOnboarding: boolean;
	upcomingLossRecord?: UpcomingLossRecord;
}

export type CalendarRenderDiagnostic =
	| {
			code: 'duplicate-special-day';
			dateKey: CalendarDateKey;
			keptSpecialDayId: string;
			ignoredSpecialDayId: string;
	  }
	| {
			code: 'missing-status-type';
			statusTypeId: string;
			availabilityEntryId: string;
	  }
	| {
			code: 'missing-assignment-type';
			assignmentTypeId: string;
			assignmentId: string;
	  }
	| {
			code: 'missing-header-assignee';
			personnelId: string;
			assignmentId: string;
	  };

export interface CalendarRenderState {
	dateKeys: readonly CalendarDateKey[];
	headerCells: readonly CalendarDateHeaderState[];
	headerCell(dateKey: CalendarDateKey): CalendarDateHeaderState | undefined;
	personHeader(personnelId: string): CalendarPersonHeaderState | undefined;
	personDateCell(personnelId: string, dateKey: CalendarDateKey): CalendarPersonDateCellState | undefined;
	personDateCells(personnelId: string): CalendarPersonDateCellState[] | undefined;
	diagnostics: readonly CalendarRenderDiagnostic[];
}

export class CalendarRenderStateInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CalendarRenderStateInputError';
	}
}

export function buildCalendarRenderState(input: CalendarRenderStateInput): CalendarRenderState {
	const diagnostics: CalendarRenderDiagnostic[] = [];
	const dateKeys = getUniqueDateKeys(input.dates);
	const dateKeySet = new Set(dateKeys);
	const personnelById = buildPersonnelById(input.personnelByGroup);
	const statusTypeById = buildStatusTypeById(input.statusTypes);
	const specialDayByDate = buildSpecialDayByDate(input.specialDays, diagnostics);
	const assignmentTypeById = buildAssignmentTypeById(input.assignmentTypes);
	const activeOnboardingPersonnelIds = new Set(input.activeOnboardingPersonnelIds ?? []);

	const availabilityByPersonDate = buildAvailabilityByPersonDate(
		input.availabilityEntries,
		statusTypeById,
		dateKeys,
		diagnostics
	);
	const assignmentsByPersonDate = buildAssignmentsByPersonDate(
		input.assignments,
		assignmentTypeById,
		dateKeySet,
		diagnostics
	);
	const headerCells = input.dates.map((date, index) => {
		const dateKey = dateKeys[index];
		const specialDay = specialDayByDate.get(dateKey);
		return {
			date,
			dateKey,
			dayName: getDayName(date),
			dayOfMonth: date.getDate(),
			weekend: isWeekend(date),
			today: isToday(date),
			specialDay,
			holiday: !!specialDay,
			holidayName: specialDay?.name,
			headerAssignment: getHeaderAssignment(
				dateKey,
				input.assignmentTypes,
				input.assignments,
				personnelById,
				input.groups ?? [],
				diagnostics
			),
			title: specialDay?.name ?? 'Click to set daily assignments'
		};
	});
	const headerByDate = new Map(headerCells.map((header) => [header.dateKey, header]));
	const rowCache = new Map<string, CalendarPersonDateCellState[]>();
	const rowCellLookupCache = new Map<string, Map<CalendarDateKey, CalendarPersonDateCellState>>();

	function personHeader(personnelId: string): CalendarPersonHeaderState | undefined {
		if (!personnelById.has(personnelId)) return undefined;
		return {
			personnelId,
			isOnboarding: activeOnboardingPersonnelIds.has(personnelId),
			highlightOnboarding: input.highlightOnboarding ?? true,
			upcomingLossRecord: input.upcomingLossMap?.get(personnelId)
		};
	}

	function personDateCells(personnelId: string): CalendarPersonDateCellState[] | undefined {
		if (!personnelById.has(personnelId)) return undefined;
		const cached = rowCache.get(personnelId);
		if (cached) return cached;

		const cells = dateKeys.map((dateKey) => {
			const header = headerByDate.get(dateKey);
			if (!header) {
				throw new CalendarRenderStateInputError(`Calendar date key ${dateKey} was not found in header cells`);
			}
			const statuses = availabilityByPersonDate.get(personnelId)?.get(dateKey) ?? [];
			const markers = assignmentsByPersonDate.get(personnelId)?.get(dateKey) ?? [];
			const titleParts = [statuses.at(-1)?.name].filter((part): part is string => !!part);

			return {
				personnelId,
				date: header.date,
				dateKey,
				weekend: header.weekend,
				today: header.today,
				specialDay: header.specialDay,
				holiday: header.holiday,
				holidayName: header.holidayName,
				statuses,
				primaryStatus: statuses.at(-1),
				markers,
				onboarding: activeOnboardingPersonnelIds.has(personnelId) && (input.highlightOnboarding ?? true),
				titleParts,
				title: titleParts.join(' | ')
			};
		});

		rowCache.set(personnelId, cells);
		rowCellLookupCache.set(personnelId, new Map(cells.map((cell) => [cell.dateKey, cell])));
		return cells;
	}

	function personDateCell(personnelId: string, dateKey: CalendarDateKey): CalendarPersonDateCellState | undefined {
		if (!personnelById.has(personnelId)) return undefined;
		personDateCells(personnelId);
		return rowCellLookupCache.get(personnelId)?.get(dateKey);
	}

	return {
		dateKeys,
		headerCells,
		headerCell: (dateKey) => headerByDate.get(dateKey),
		personHeader,
		personDateCell,
		personDateCells,
		diagnostics
	};
}

function getUniqueDateKeys(dates: readonly Date[]): CalendarDateKey[] {
	const seen = new Set<CalendarDateKey>();
	const dateKeys: CalendarDateKey[] = [];
	for (const date of dates) {
		if (Number.isNaN(date.getTime())) {
			throw new CalendarRenderStateInputError('Calendar render state received an invalid date');
		}
		const dateKey = formatDate(date);
		if (seen.has(dateKey)) {
			throw new CalendarRenderStateInputError(`Calendar render state received duplicate date ${dateKey}`);
		}
		seen.add(dateKey);
		dateKeys.push(dateKey);
	}
	return dateKeys;
}

function buildPersonnelById(
	personnelByGroup: readonly { group: string; personnel: readonly Personnel[] }[]
): Map<string, Personnel> {
	const map = new Map<string, Personnel>();
	for (const group of personnelByGroup) {
		for (const person of group.personnel) {
			map.set(person.id, person);
		}
	}
	return map;
}

function buildStatusTypeById(statusTypes: readonly StatusType[]): Map<string, StatusType> {
	return new Map(statusTypes.map((statusType) => [statusType.id, statusType]));
}

function buildAssignmentTypeById(assignmentTypes: readonly AssignmentType[]): Map<string, AssignmentType> {
	return new Map(assignmentTypes.map((assignmentType) => [assignmentType.id, assignmentType]));
}

function buildSpecialDayByDate(
	specialDays: readonly SpecialDay[],
	diagnostics: CalendarRenderDiagnostic[]
): Map<string, SpecialDay> {
	const map = new Map<string, SpecialDay>();
	for (const specialDay of specialDays) {
		const existing = map.get(specialDay.date);
		if (existing) {
			diagnostics.push({
				code: 'duplicate-special-day',
				dateKey: specialDay.date,
				keptSpecialDayId: existing.id,
				ignoredSpecialDayId: specialDay.id
			});
			continue;
		}
		map.set(specialDay.date, specialDay);
	}
	return map;
}

function buildAvailabilityByPersonDate(
	availabilityEntries: readonly AvailabilityEntry[],
	statusTypeById: ReadonlyMap<string, StatusType>,
	dateKeys: readonly CalendarDateKey[],
	diagnostics: CalendarRenderDiagnostic[]
): Map<string, Map<string, CalendarCellStatusState[]>> {
	const byPersonDate = new Map<string, Map<string, CalendarCellStatusState[]>>();
	for (const entry of availabilityEntries) {
		const statusType = statusTypeById.get(entry.statusTypeId);
		if (!statusType) {
			diagnostics.push({
				code: 'missing-status-type',
				statusTypeId: entry.statusTypeId,
				availabilityEntryId: entry.id
			});
			continue;
		}
		for (const dateKey of dateKeys) {
			if (dateKey < entry.startDate || dateKey > entry.endDate) continue;
			let dateMap = byPersonDate.get(entry.personnelId);
			if (!dateMap) {
				dateMap = new Map<string, CalendarCellStatusState[]>();
				byPersonDate.set(entry.personnelId, dateMap);
			}
			let statuses = dateMap.get(dateKey);
			if (!statuses) {
				statuses = [];
				dateMap.set(dateKey, statuses);
			}
			statuses.push({
				id: entry.id,
				name: statusType.name,
				color: statusType.color,
				textColor: statusType.textColor,
				note: entry.note ?? undefined
			});
		}
	}
	return byPersonDate;
}

function buildAssignmentsByPersonDate(
	assignments: readonly DailyAssignment[],
	assignmentTypeById: ReadonlyMap<string, AssignmentType>,
	dateKeySet: ReadonlySet<CalendarDateKey>,
	diagnostics: CalendarRenderDiagnostic[]
): Map<string, Map<string, CalendarCellMarkerState[]>> {
	const byPersonDate = new Map<string, Map<string, CalendarCellMarkerState[]>>();
	for (const assignment of assignments) {
		const assignmentType = assignmentTypeById.get(assignment.assignmentTypeId);
		if (!assignmentType) {
			diagnostics.push({
				code: 'missing-assignment-type',
				assignmentTypeId: assignment.assignmentTypeId,
				assignmentId: assignment.id
			});
			continue;
		}
		if (assignmentType.assignTo !== 'personnel' || !dateKeySet.has(assignment.date)) continue;
		let dateMap = byPersonDate.get(assignment.assigneeId);
		if (!dateMap) {
			dateMap = new Map<string, CalendarCellMarkerState[]>();
			byPersonDate.set(assignment.assigneeId, dateMap);
		}
		let markers = dateMap.get(assignment.date);
		if (!markers) {
			markers = [];
			dateMap.set(assignment.date, markers);
		}
		markers.push({
			id: assignment.id,
			name: assignmentType.name,
			shortName: assignmentType.shortName,
			color: assignmentType.color,
			textColor: '#ffffff',
			title: assignmentType.name
		});
	}
	return byPersonDate;
}

function getHeaderAssignment(
	dateKey: CalendarDateKey,
	assignmentTypes: readonly AssignmentType[],
	assignments: readonly DailyAssignment[],
	personnelById: ReadonlyMap<string, Personnel>,
	groups: readonly Group[],
	diagnostics: CalendarRenderDiagnostic[]
): CalendarHeaderAssignmentState | undefined {
	const headerType = assignmentTypes.find((assignmentType) => assignmentType.showInDateHeader);
	if (!headerType) return undefined;
	const assignment = assignments.find(
		(candidate) => candidate.date === dateKey && candidate.assignmentTypeId === headerType.id
	);
	if (!assignment?.assigneeId) return undefined;

	if (headerType.assignTo !== 'personnel') {
		return {
			assignmentTypeName: headerType.name,
			assigneeLabel: groups.find((group) => group.id === assignment.assigneeId)?.name ?? 'Unknown Group'
		};
	}

	const person = personnelById.get(assignment.assigneeId);
	if (!person) {
		diagnostics.push({
			code: 'missing-header-assignee',
			personnelId: assignment.assigneeId,
			assignmentId: assignment.id
		});
	}

	return {
		assignmentTypeName: headerType.name,
		assigneeLabel: person ? `${person.rank} ${person.lastName}` : assignment.assigneeId
	};
}
