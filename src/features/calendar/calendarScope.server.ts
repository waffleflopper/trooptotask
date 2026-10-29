import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PersonnelCalendarRosterPort } from '$features/personnel/contracts';

export interface CalendarAssigneeScope {
	groupIds: string[];
	personnelIds: string[];
}

export function requirePersonnelCalendarRoster<Methods extends keyof PersonnelCalendarRosterPort>(ctx: {
	personnelCalendarRoster?: Pick<PersonnelCalendarRosterPort, Methods>;
}) {
	if (!ctx.personnelCalendarRoster) throw new Error('Personnel Calendar roster provider unavailable');
	return ctx.personnelCalendarRoster;
}

export async function resolveCalendarAssigneeScope(ctx: {
	auth: OrganizationAccessGrant;
	personnelCalendarRoster?: Pick<PersonnelCalendarRosterPort, 'listAssigneeIds'>;
}): Promise<CalendarAssigneeScope | null> {
	if (ctx.auth.scopeSet.kind !== 'groups') {
		return null;
	}

	const groupIds = uniqueNonEmptyIds(ctx.auth.scopeSet.groupIds);
	if (groupIds.length === 0) {
		return { groupIds, personnelIds: [] };
	}

	const personnelIds = await requirePersonnelCalendarRoster(ctx).listAssigneeIds(ctx.auth);

	return { groupIds, personnelIds };
}

function uniqueNonEmptyIds(ids: readonly string[]): string[] {
	return [...new Set(ids.filter(Boolean))];
}
