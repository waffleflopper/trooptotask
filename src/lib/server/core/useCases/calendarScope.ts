import type { FindOptions } from '$lib/server/core/ports';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PersonnelCalendarRosterPort } from '$features/personnel/contracts';

export interface CalendarGroupScope {
	groupIds: string[];
}

export interface CalendarAssigneeScope extends CalendarGroupScope {
	personnelIds: string[];
}

type InFilterOptions = Pick<FindOptions, 'inFilters'>;

export function requirePersonnelCalendarRoster<Methods extends keyof PersonnelCalendarRosterPort>(ctx: {
	personnelCalendarRoster?: Pick<PersonnelCalendarRosterPort, Methods>;
}) {
	if (!ctx.personnelCalendarRoster) throw new Error('Personnel Calendar roster provider unavailable');
	return ctx.personnelCalendarRoster;
}

export function resolveCalendarGroupScope(ctx: { auth: OrganizationAccessGrant }): CalendarGroupScope | null {
	if (ctx.auth.scopeSet.kind !== 'groups') {
		return null;
	}

	return {
		groupIds: uniqueNonEmptyIds(ctx.auth.scopeSet.groupIds)
	};
}

export async function resolveCalendarAssigneeScope(ctx: {
	auth: OrganizationAccessGrant;
	personnelCalendarRoster?: Pick<PersonnelCalendarRosterPort, 'listAssigneeIds'>;
}): Promise<CalendarAssigneeScope | null> {
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

export function personnelInFilter(
	scope: CalendarAssigneeScope | null,
	column: string
): InFilterOptions | Record<string, never> {
	return scope ? { inFilters: { [column]: scope.personnelIds } } : {};
}

function uniqueNonEmptyIds(ids: string[]): string[] {
	return [...new Set(ids.filter(Boolean))];
}
