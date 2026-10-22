import type { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { fail } from '$lib/errors';
import { CALENDAR_CHANGE_NOT_SAVED_MESSAGE, DEVICE_DATE_MESSAGE } from './calendarCatalogPersistence.server';
import { sameIdList } from './utils/idList';
import { lastDayOf } from './utils/da6View';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';

type CalendarMemoryStore = Pick<
	ReturnType<typeof createInMemoryDataStore>,
	'findOne' | 'findMany' | 'insert' | 'update' | 'delete' | 'deleteWhere' | 'insertMany'
>;
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { PoolRules, TrackId, WeekendMode } from './roster/rosterTypes';
import type {
	CalendarAssignmentReader,
	CalendarAvailabilityPersistence,
	CalendarAvailabilityRemovalPort,
	CalendarCatalogPersistence
} from './contracts';
import {
	toAssignment,
	toAssignmentType,
	toAvailability,
	toClosedFormMonth,
	toOpenRosterForm,
	toSpecialDay,
	toStatusType,
	type AssignmentRow,
	type AssignmentTypeRow,
	type AvailabilityRow,
	type RosterExcusalRow,
	type SpecialDayRow,
	type StatusTypeRow
} from './calendarPersistenceMapping.server';

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

type RosterFormMemoryRow = {
	id: string;
	assignment_type_id: string;
	starts_on: string;
	ends_on: string | null;
	rules: { pool: PoolRules | null; weekendMode: WeekendMode };
	record: unknown;
};
type RosterExcusalMemoryRow = RosterExcusalRow & { id: string; assignment_type_id: string; ends_on: string | null };

const addDays = (date: string, days: number) => fromDayNumber(toDayNumber(date) + days);
const utcDate = (offsetDays = 0) => addDays(new Date().toISOString().slice(0, 10), offsetDays);

function checkDeviceDate(today: string) {
	if (today < utcDate(-1) || today > utcDate(1)) fail(400, DEVICE_DATE_MESSAGE);
}

export function createInMemoryCalendarCatalogPersistence(
	store: CalendarMemoryStore,
	orgId: string
): CalendarCatalogPersistence {
	// Rows seeded without the column read as the database default does.
	const withEffectDefault = (row: StatusTypeRow): StatusTypeRow => ({
		...row,
		roster_effect: row.roster_effect ?? 'A'
	});
	const savedStatusTypes = async () =>
		(await store.findMany<StatusTypeRow>('status_types', orgId))
			.map(withEffectDefault)
			.sort((a, b) => a.sort_order - b.sort_order || compareIds(a.id, b.id));
	async function updateExisting<T>(table: string, id: string, patch: Record<string, unknown>): Promise<T | null> {
		if (!(await store.findOne(table, orgId, { id }))) return null;
		return store.update<T>(table, orgId, id, patch);
	}
	async function withExcusals(rows: AssignmentTypeRow[]): Promise<AssignmentTypeRow[]> {
		const excusals = await store.findMany<RosterExcusalMemoryRow>('roster_excusals', orgId);
		return rows.map((row) => ({
			...row,
			roster_excusals: excusals.filter((excusal) => excusal.assignment_type_id === row.id)
		}));
	}
	const openForm = (assignmentTypeId: string) =>
		store.findOne<RosterFormMemoryRow>('roster_forms', orgId, { assignment_type_id: assignmentTypeId, ends_on: null });
	// Mirrors calendar_private.open_roster_form.
	async function ensureOpenForm(row: AssignmentTypeRow) {
		if (row.assign_to !== 'personnel' || (await openForm(row.id))) return;
		const closed = await store.findMany<RosterFormMemoryRow>('roster_forms', orgId, { assignment_type_id: row.id });
		const afterClosed =
			closed
				.map(({ ends_on }) => (ends_on ? addDays(ends_on, 1) : ''))
				.sort()
				.at(-1) ?? '';
		await store.insert('roster_forms', orgId, {
			assignment_type_id: row.id,
			starts_on: afterClosed > utcDate() ? afterClosed : utcDate(),
			ends_on: null,
			rules: { pool: row.roster_pool_rules, weekendMode: row.roster_weekend_mode },
			record: null
		});
	}
	async function rosterType(id: string) {
		const type = await store.findOne<AssignmentTypeRow>('assignment_types', orgId, { id });
		if (type?.assign_to !== 'personnel') fail(404, 'That assignment type is no longer available.');
		return type;
	}
	async function deleteExisting(table: string, id: string): Promise<boolean> {
		if (!(await store.findOne(table, orgId, { id }))) return false;
		await store.delete(table, orgId, id);
		return true;
	}

	return {
		async listStatusTypes() {
			return (await savedStatusTypes()).map(toStatusType);
		},
		listStatusTypeLabels() {
			return store.findMany('status_types', orgId, undefined, { select: 'id, name' });
		},
		async createStatusType(input) {
			const saved = await savedStatusTypes();
			return toStatusType(
				await store.insert<StatusTypeRow>('status_types', orgId, {
					name: input.name,
					color: input.color ?? '#6b7280',
					text_color: input.textColor ?? '#ffffff',
					short_label: input.shortLabel ?? null,
					roster_effect: input.rosterEffect ?? 'A',
					sort_order: Math.max(-1, ...saved.map((type) => type.sort_order)) + 1
				})
			);
		},
		async updateStatusType(id, patch) {
			const row = await updateExisting<StatusTypeRow>(
				'status_types',
				id,
				defined({
					name: patch.name,
					color: patch.color,
					text_color: patch.textColor,
					short_label: patch.shortLabel,
					roster_effect: patch.rosterEffect
				})
			);
			return row && toStatusType(withEffectDefault(row));
		},
		deleteStatusType(id) {
			return deleteExisting('status_types', id);
		},
		async setStatusTypeOrder(statusTypeIds, expectedStatusTypeIds) {
			const saved = (await savedStatusTypes()).map((type) => type.id);
			if (sameIdList(saved, statusTypeIds)) return;
			if (!sameIdList(saved, expectedStatusTypeIds)) fail(409, CALENDAR_CHANGE_NOT_SAVED_MESSAGE);
			if (statusTypeIds.length !== saved.length || saved.some((id) => !statusTypeIds.includes(id)))
				fail(400, 'Invalid Calendar configuration');
			for (const [position, id] of statusTypeIds.entries())
				if (saved[position] !== id) await store.update('status_types', orgId, id, { sort_order: position });
		},
		async listAssignmentTypes() {
			return (
				await withExcusals(
					await store.findMany<AssignmentTypeRow>('assignment_types', orgId, undefined, {
						orderBy: [
							{ column: 'sort_order', ascending: true },
							{ column: 'id', ascending: true }
						]
					})
				)
			).map(toAssignmentType);
		},
		async listAssignmentTypeTargets(ids) {
			if (ids.length === 0) return [];
			return (
				await store.findMany<{ id: string; assign_to: string }>('assignment_types', orgId, undefined, {
					inFilters: { id: ids },
					select: 'id, assign_to'
				})
			).map((row) => ({
				id: row.id,
				assignTo: row.assign_to === 'group' ? ('group' as const) : ('personnel' as const)
			}));
		},
		async createAssignmentType(input) {
			const row = await store.insert<AssignmentTypeRow>('assignment_types', orgId, {
				name: input.name,
				short_name: input.shortName,
				assign_to: input.assignTo,
				color: input.color ?? '#6b7280',
				sort_order: 0,
				show_on_calendar: false,
				roster_pool_rules: input.poolRules ?? null,
				roster_weekend_mode: input.weekendMode ?? 'same'
			});
			await ensureOpenForm(row);
			return toAssignmentType({ ...row, roster_excusals: [] });
		},
		async updateAssignmentType(id, patch) {
			if (patch.assignTo === 'group' && (await openForm(id)))
				throw new Error('Close the DA 6 form before the type becomes a Group assignment');
			const row = await updateExisting<AssignmentTypeRow>(
				'assignment_types',
				id,
				defined({
					name: patch.name,
					short_name: patch.shortName,
					assign_to: patch.assignTo,
					color: patch.color
				})
			);
			if (!row) return null;
			await ensureOpenForm(row);
			return toAssignmentType((await withExcusals([row]))[0]);
		},
		deleteAssignmentType(id) {
			return deleteExisting('assignment_types', id);
		},
		async listSpecialDays(range) {
			return (
				await store.findMany<SpecialDayRow>(
					'special_days',
					orgId,
					undefined,
					range
						? {
								rangeFilters: [
									{ column: 'date', op: 'gte', value: range.rangeStart },
									{ column: 'date', op: 'lte', value: range.rangeEnd }
								],
								orderBy: [{ column: 'date', ascending: true }]
							}
						: undefined
				)
			).map(toSpecialDay);
		},
		async addClosureDays(name, dates) {
			const taken = new Set((await store.findMany<SpecialDayRow>('special_days', orgId)).map((day) => day.date));
			const rows = await store.insertMany<SpecialDayRow>(
				'special_days',
				orgId,
				dates.filter((date) => !taken.has(date)).map((date) => ({ date, name, type: 'org-closure' }))
			);
			return rows.map(toSpecialDay).sort((a, b) => a.date.localeCompare(b.date));
		},
		async updateSpecialDay(id, patch) {
			const row = await updateExisting<SpecialDayRow>('special_days', id, defined({ ...patch }));
			return row && toSpecialDay(row);
		},
		deleteSpecialDay(id) {
			return deleteExisting('special_days', id);
		},
		async resetFederalHolidays(holidays) {
			await store.deleteWhere('special_days', orgId, { type: 'federal-holiday' });
			const rows = await store.insertMany<SpecialDayRow>(
				'special_days',
				orgId,
				holidays.map((holiday) => ({ ...holiday, type: 'federal-holiday' }))
			);
			return rows
				.map((row) => ({ ...toSpecialDay(row), type: 'federal-holiday' as const }))
				.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
		},
		async setCalendarLanes(laneTypeIds, expectedLaneTypeIds) {
			const types = await store.findMany<AssignmentTypeRow>('assignment_types', orgId);
			const active = new Set(types.filter((type) => !type.archived_at).map((type) => type.id));
			if (laneTypeIds.some((id) => !active.has(id))) fail(404, 'That assignment type is no longer available.');
			const saved = types
				.filter((type) => type.show_on_calendar && !type.archived_at)
				.sort((a, b) => a.sort_order - b.sort_order || compareIds(a.id, b.id))
				.map((type) => type.id);
			if (sameIdList(saved, laneTypeIds)) return;
			if (!sameIdList(saved, expectedLaneTypeIds)) fail(409, CALENDAR_CHANGE_NOT_SAVED_MESSAGE);
			for (const type of types) {
				const position = laneTypeIds.indexOf(type.id);
				if (position >= 0 && (!type.show_on_calendar || type.sort_order !== position))
					await store.update('assignment_types', orgId, type.id, { show_on_calendar: true, sort_order: position });
				else if (position < 0 && type.show_on_calendar)
					await store.update('assignment_types', orgId, type.id, { show_on_calendar: false });
			}
		},
		async findOpenRosterForm(assignmentTypeId) {
			const form = await openForm(assignmentTypeId);
			if (!form) return null;
			const numbers = await store.findMany<{
				personnel_id: string;
				track: TrackId;
				count: number;
				origin: 'typed' | 'carried';
			}>('roster_starting_numbers', orgId, { form_id: form.id });
			return toOpenRosterForm({ ...form, roster_starting_numbers: numbers });
		},
		async listClosedRosterForms(assignmentTypeId, month) {
			return (
				await store.findMany<RosterFormMemoryRow>('roster_forms', orgId, { assignment_type_id: assignmentTypeId })
			)
				.filter(
					(form): form is RosterFormMemoryRow & { ends_on: string } =>
						form.ends_on !== null && form.starts_on <= lastDayOf(month) && form.ends_on >= `${month}-01`
				)
				.sort((a, b) => a.starts_on.localeCompare(b.starts_on))
				.map((form) => toClosedFormMonth(form, month));
		},
		async listRosterExcusals(assignmentTypeId) {
			return (
				await store.findMany<RosterExcusalMemoryRow>('roster_excusals', orgId, { assignment_type_id: assignmentTypeId })
			)
				.sort((a, b) => a.starts_on.localeCompare(b.starts_on) || compareIds(a.id, b.id))
				.map((row) => ({ personId: row.personnel_id, reason: row.reason, from: row.starts_on, through: row.ends_on }));
		},
		// Mirrors public.set_roster_excusals.
		async setRosterExcusals(assignmentTypeId, today, excusals) {
			checkDeviceDate(today);
			await rosterType(assignmentTypeId);
			const wanted = new Map(excusals.map(({ personId, reason }) => [personId, reason.trim()]));
			const open = await store.findMany<RosterExcusalMemoryRow>('roster_excusals', orgId, {
				assignment_type_id: assignmentTypeId,
				ends_on: null
			});
			for (const excusal of open) {
				const reason = wanted.get(excusal.personnel_id);
				if (reason === undefined && excusal.starts_on >= today)
					await store.delete('roster_excusals', orgId, excusal.id);
				else if (reason === undefined)
					await store.update('roster_excusals', orgId, excusal.id, { ends_on: addDays(today, -1) });
				else if (reason !== excusal.reason) await store.update('roster_excusals', orgId, excusal.id, { reason });
				wanted.delete(excusal.personnel_id);
			}
			for (const [personId, reason] of wanted)
				await store.insert('roster_excusals', orgId, {
					assignment_type_id: assignmentTypeId,
					personnel_id: personId,
					reason,
					starts_on: today,
					ends_on: null
				});
		},
		// Mirrors public.close_roster_form.
		async closeRosterForm(input) {
			checkDeviceDate(input.today);
			await rosterType(input.assignmentTypeId);
			const form = await openForm(input.assignmentTypeId);
			if (form?.id !== input.formId) fail(409, CALENDAR_CHANGE_NOT_SAVED_MESSAGE);
			if (form.starts_on > input.today !== (input.record === null)) fail(400, 'Invalid Calendar configuration');
			const rules = { pool: input.poolRules, weekendMode: input.weekendMode };
			let next = form.id;
			if (input.record === null) {
				await store.update('roster_forms', orgId, form.id, { rules });
				await store.deleteWhere('roster_starting_numbers', orgId, { form_id: form.id });
			} else {
				await store.update('roster_forms', orgId, form.id, { ends_on: input.today, record: input.record });
				next = (
					await store.insert<RosterFormMemoryRow>('roster_forms', orgId, {
						assignment_type_id: input.assignmentTypeId,
						starts_on: addDays(input.today, 1),
						ends_on: null,
						rules,
						record: null
					})
				).id;
			}
			await store.insertMany(
				'roster_starting_numbers',
				orgId,
				input.carry.map((number) => ({
					form_id: next,
					personnel_id: number.personId,
					track: number.track,
					count: number.count,
					origin: number.origin
				}))
			);
			await store.update('assignment_types', orgId, input.assignmentTypeId, {
				roster_pool_rules: input.poolRules,
				roster_weekend_mode: input.weekendMode
			});
			return next;
		},
		async endRosterForm(input) {
			checkDeviceDate(input.today);
			await rosterType(input.assignmentTypeId);
			const form = await openForm(input.assignmentTypeId);
			if (form?.id !== input.formId) fail(409, CALENDAR_CHANGE_NOT_SAVED_MESSAGE);
			if (form.starts_on > input.today !== (input.record === null)) fail(400, 'Invalid Calendar configuration');
			if (input.record === null) {
				await store.deleteWhere('roster_starting_numbers', orgId, { form_id: form.id });
				await store.delete('roster_forms', orgId, form.id);
			} else {
				await store.update('roster_forms', orgId, form.id, { ends_on: input.today, record: input.record });
			}
			await store.update('assignment_types', orgId, input.assignmentTypeId, { assign_to: 'group' });
		}
	};
}

export function createInMemoryCalendarAvailabilityPersistence(
	store: CalendarMemoryStore,
	{
		orgId,
		scopeSet,
		loadScopedPersonnelIds,
		removal
	}: {
		orgId: string;
		scopeSet: ScopeSet;
		loadScopedPersonnelIds: () => Promise<string[]>;
		removal: CalendarAvailabilityRemovalPort;
	}
): CalendarAvailabilityPersistence {
	const groups = scopeSet.kind === 'groups' ? [...new Set(scopeSet.groupIds.filter(Boolean))] : null;
	let personnelIdsPromise: Promise<string[]> | undefined;
	return {
		...removal,
		async listOverlapping(input) {
			if (groups?.length === 0 || input.personnelIds?.length === 0) return [];
			let allowed = input.personnelIds;
			if (groups) {
				const scoped = new Set(await (personnelIdsPromise ??= loadScopedPersonnelIds()));
				allowed = allowed === undefined ? [...scoped] : allowed.filter((id) => scoped.has(id));
			}
			if (allowed?.length === 0 || (allowed && input.personnelId !== undefined && !allowed.includes(input.personnelId)))
				return [];
			return (
				await store.findMany<AvailabilityRow>(
					'availability_entries',
					orgId,
					input.personnelId === undefined ? undefined : { personnel_id: input.personnelId },
					{
						...(allowed === undefined ? {} : { inFilters: { personnel_id: allowed } }),
						rangeFilters: [
							{ column: 'end_date', op: 'gte', value: input.rangeStart },
							{ column: 'start_date', op: 'lte', value: input.rangeEnd }
						],
						...(input.orderByEndDate ? { orderBy: [{ column: 'end_date', ascending: true }] } : {})
					}
				)
			).map(toAvailability);
		},
		async listPersonnelHistory(personnelId) {
			return (
				await store.findMany<AvailabilityRow>(
					'availability_entries',
					orgId,
					{ personnel_id: personnelId },
					{ orderBy: [{ column: 'start_date', ascending: false }] }
				)
			).map(toAvailability);
		},
		async findReference(id) {
			const row = await store.findOne<{ personnel_id: string }>('availability_entries', orgId, { id }, 'personnel_id');
			return row ? { personnelId: row.personnel_id } : null;
		},
		async create(input) {
			return toAvailability(
				await store.insert<AvailabilityRow>('availability_entries', orgId, {
					personnel_id: input.personnelId,
					status_type_id: input.statusTypeId,
					start_date: input.startDate,
					end_date: input.endDate,
					note: input.note ?? null
				})
			);
		},
		async update(id, patch) {
			return toAvailability(
				await store.update<AvailabilityRow>(
					'availability_entries',
					orgId,
					id,
					defined({
						status_type_id: patch.statusTypeId,
						start_date: patch.startDate,
						end_date: patch.endDate,
						note: patch.note
					})
				)
			);
		},
		delete(id) {
			return store.delete('availability_entries', orgId, id);
		},
		async createMany(inputs) {
			if (inputs.length === 0) return [];
			return (
				await store.insertMany<AvailabilityRow>(
					'availability_entries',
					orgId,
					inputs.map((input) => ({
						personnel_id: input.personnelId,
						status_type_id: input.statusTypeId,
						start_date: input.startDate,
						end_date: input.endDate,
						note: input.note ?? null
					}))
				)
			).map(toAvailability);
		}
	};
}

export function createInMemoryCalendarAssignmentReader(
	store: CalendarMemoryStore,
	orgId: string
): CalendarAssignmentReader {
	return {
		async listRange(range) {
			return (
				await store.findMany<AssignmentRow>('daily_assignments', orgId, undefined, {
					...(range.assigneeIds ? { inFilters: { assignee_id: [...range.assigneeIds] } } : {}),
					rangeFilters: [
						{ column: 'date', op: 'gte', value: range.rangeStart },
						{ column: 'date', op: 'lte', value: range.rangeEnd }
					]
				})
			).map(toAssignment);
		},
		async listDayReferences(date, assignmentTypeId) {
			return (
				await store.findMany<{ assignment_type_id: string; assignee_id: string }>(
					'daily_assignments',
					orgId,
					{ date, ...(assignmentTypeId === undefined ? {} : { assignment_type_id: assignmentTypeId }) },
					{ select: 'assignment_type_id, assignee_id' }
				)
			).map((row) => ({ assignmentTypeId: row.assignment_type_id, assigneeId: row.assignee_id }));
		},
		async listRosterDetailDays(assignmentTypeId, span) {
			return (
				await store.findMany<AssignmentRow>(
					'daily_assignments',
					orgId,
					{ assignment_type_id: assignmentTypeId },
					{
						rangeFilters: [
							{ column: 'date', op: 'gte', value: span.from },
							{ column: 'date', op: 'lte', value: span.through }
						]
					}
				)
			)
				.map(({ date, assignee_id, source }) => ({ date, assigneeId: assignee_id, source: source ?? 'manual' }))
				.sort((a, b) => a.date.localeCompare(b.date));
		},
		async listSlotReferences(slots) {
			if (slots.length === 0) return [];
			const keys = new Set(slots.map((slot) => `${slot.date}/${slot.assignmentTypeId}`));
			return (
				await store.findMany<{ date: string; assignment_type_id: string; assignee_id: string }>(
					'daily_assignments',
					orgId,
					undefined,
					{
						inFilters: {
							date: [...new Set(slots.map((slot) => slot.date))],
							assignment_type_id: [...new Set(slots.map((slot) => slot.assignmentTypeId))]
						},
						select: 'date, assignment_type_id, assignee_id'
					}
				)
			)
				.filter((row) => keys.has(`${row.date}/${row.assignment_type_id}`))
				.map((row) => ({ date: row.date, assignmentTypeId: row.assignment_type_id, assigneeId: row.assignee_id }));
		}
	};
}

function defined(patch: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
}
