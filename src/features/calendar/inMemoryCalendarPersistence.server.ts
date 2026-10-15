import type { createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { fail } from '$lib/errors';

type CalendarMemoryStore = Pick<
	ReturnType<typeof createInMemoryDataStore>,
	'findOne' | 'findMany' | 'insert' | 'update' | 'delete' | 'deleteWhere' | 'insertMany'
>;
import type { ScopeSet } from '$lib/access/memberAccessShape';
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
	toSpecialDay,
	toStatusType,
	type AssignmentRow,
	type AssignmentTypeRow,
	type AvailabilityRow,
	type SpecialDayRow,
	type StatusTypeRow
} from './calendarPersistenceMapping.server';

export function createInMemoryCalendarCatalogPersistence(
	store: CalendarMemoryStore,
	orgId: string
): CalendarCatalogPersistence {
	async function updateExisting<T>(table: string, id: string, patch: Record<string, unknown>): Promise<T | null> {
		if (!(await store.findOne(table, orgId, { id }))) return null;
		return store.update<T>(table, orgId, id, patch);
	}
	async function deleteExisting(table: string, id: string): Promise<boolean> {
		if (!(await store.findOne(table, orgId, { id }))) return false;
		await store.delete(table, orgId, id);
		return true;
	}

	return {
		async listStatusTypes() {
			return (
				await store.findMany<StatusTypeRow>('status_types', orgId, undefined, {
					orderBy: [{ column: 'sort_order', ascending: true }]
				})
			).map(toStatusType);
		},
		listStatusTypeLabels() {
			return store.findMany('status_types', orgId, undefined, { select: 'id, name' });
		},
		async createStatusType(input) {
			return toStatusType(
				await store.insert<StatusTypeRow>('status_types', orgId, {
					name: input.name,
					color: input.color ?? '#6b7280',
					text_color: input.textColor ?? '#ffffff',
					sort_order: input.sortOrder ?? 0
				})
			);
		},
		async updateStatusType(id, patch) {
			const row = await updateExisting<StatusTypeRow>(
				'status_types',
				id,
				defined({ name: patch.name, color: patch.color, text_color: patch.textColor, sort_order: patch.sortOrder })
			);
			return row && toStatusType(row);
		},
		deleteStatusType(id) {
			return deleteExisting('status_types', id);
		},
		async listAssignmentTypes() {
			return (
				await store.findMany<AssignmentTypeRow>('assignment_types', orgId, undefined, {
					orderBy: [{ column: 'sort_order', ascending: true }]
				})
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
			return toAssignmentType(
				await store.insert<AssignmentTypeRow>('assignment_types', orgId, {
					name: input.name,
					short_name: input.shortName,
					assign_to: input.assignTo,
					color: input.color ?? '#6b7280',
					sort_order: input.sortOrder ?? 0,
					show_in_date_header: false,
					exempt_personnel_ids: input.exemptPersonnelIds ?? []
				})
			);
		},
		async updateAssignmentType(id, patch) {
			const row = await updateExisting<AssignmentTypeRow>(
				'assignment_types',
				id,
				defined({
					name: patch.name,
					short_name: patch.shortName,
					assign_to: patch.assignTo,
					color: patch.color,
					sort_order: patch.sortOrder,
					exempt_personnel_ids: patch.exemptPersonnelIds
				})
			);
			return row && toAssignmentType(row);
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
		async createSpecialDay(input) {
			return toSpecialDay(await store.insert<SpecialDayRow>('special_days', orgId, { ...input }));
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
		async setDateHeader(assignmentTypeId) {
			const target = await store.findOne<AssignmentTypeRow>('assignment_types', orgId, { id: assignmentTypeId });
			if (!target || target.archived_at) fail(404, 'That assignment type is no longer available.');
			const types = await store.findMany<AssignmentTypeRow>('assignment_types', orgId);
			for (const type of types) {
				const header = type.id === assignmentTypeId;
				if (type.show_in_date_header !== header)
					await store.update('assignment_types', orgId, type.id, { show_in_date_header: header });
			}
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
