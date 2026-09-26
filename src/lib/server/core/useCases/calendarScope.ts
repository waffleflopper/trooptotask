import type { FindOptions, QueryPorts } from '$lib/server/core/ports';
import type { PersonnelCalendarRosterPort } from '$features/personnel/contracts';

export interface CalendarGroupScope {
	groupIds: string[];
}

export interface CalendarAssigneeScope extends CalendarGroupScope {
	personnelIds: string[];
}

type InFilterOptions = Pick<FindOptions, 'inFilters'>;

export function requirePersonnelCalendarRoster(ctx: { personnelCalendarRoster?: PersonnelCalendarRosterPort }) {
	if (!ctx.personnelCalendarRoster) throw new Error('Personnel Calendar roster provider unavailable');
	return ctx.personnelCalendarRoster;
}

export function resolveCalendarGroupScope(ctx: Pick<QueryPorts, 'auth'>): CalendarGroupScope | null {
	if (ctx.auth.scopeSet.kind !== 'groups') {
		return null;
	}

	return {
		groupIds: uniqueNonEmptyIds(ctx.auth.scopeSet.groupIds)
	};
}

export async function resolveCalendarAssigneeScope(ctx: QueryPorts): Promise<CalendarAssigneeScope | null> {
	const groupScope = resolveCalendarGroupScope(ctx);
	if (!groupScope) {
		return null;
	}

	if (groupScope.groupIds.length === 0) {
		return { ...groupScope, personnelIds: [] };
	}

	const personnelIds = await requirePersonnelCalendarRoster(ctx).listAssigneeIds(ctx.auth);

	return {
		...groupScope,
		personnelIds
	};
}

export function groupInFilter(
	scope: CalendarGroupScope | null,
	column: string
): InFilterOptions | Record<string, never> {
	return scope ? { inFilters: { [column]: scope.groupIds } } : {};
}

export function personnelInFilter(
	scope: CalendarAssigneeScope | null,
	column: string
): InFilterOptions | Record<string, never> {
	return scope ? { inFilters: { [column]: scope.personnelIds } } : {};
}

export function filterRowsByCalendarAssigneeScope(
	rows: Record<string, unknown>[],
	scope: CalendarAssigneeScope | null
): Record<string, unknown>[] {
	if (!scope) {
		return rows;
	}

	const allowedAssigneeIds = new Set([...scope.personnelIds, ...scope.groupIds]);
	return rows.filter((row) => typeof row.assignee_id === 'string' && allowedAssigneeIds.has(row.assignee_id));
}

function uniqueNonEmptyIds(ids: string[]): string[] {
	return [...new Set(ids.filter(Boolean))];
}
