import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { PERSONNEL_FIELDS, toPersonnel } from './personnelPersistenceMapping.server';
import type {
	PersonnelAttributeState,
	PersonnelAttributeTimeline,
	PersonnelCalendarRosterPort,
	PersonnelRosterActor
} from './contracts';
import { queryScopedPersonnelRows } from './scopedRosterQuery.server';

// Targeted IDs travel in a PostgREST URL. A 500-Person Calendar batch needs
// smaller lookups so the provider does not reject the request as URI too long.
const TARGETED_LOOKUP_SIZE = 100;

type HistoryRow = {
	effective_on: string;
	rank: string;
	mos: string;
	clinic_role: string;
	group_id: string | null;
	archived: boolean;
};

export function toAttributeTimeline(row: Record<string, unknown>): PersonnelAttributeTimeline {
	const history = ((row.history as HistoryRow[] | null) ?? [])
		.map(
			(entry): PersonnelAttributeState => ({
				from: entry.effective_on,
				archived: entry.archived,
				rank: entry.rank,
				mos: entry.mos,
				clinicRole: entry.clinic_role,
				groupId: entry.group_id
			})
		)
		.sort((a, b) => a.from.localeCompare(b.from));
	// The history trigger writes a row for every Person; the current values stand in if one is ever missing.
	const [first = current(row), ...rest] = history;
	return {
		id: row.id as string,
		rank: row.rank as string,
		lastName: row.last_name as string,
		firstName: row.first_name as string,
		states: [first, ...rest]
	};
}

function current(row: Record<string, unknown>): PersonnelAttributeState {
	return {
		from: (row.created_at as string).slice(0, 10),
		archived: row.archived_at != null,
		rank: row.rank as string,
		mos: (row.mos as string | null) ?? '',
		clinicRole: (row.clinic_role as string | null) ?? '',
		groupId: (row.group_id as string | null) ?? null
	};
}

async function requireCalendarRosterRead(actor: PersonnelRosterActor): Promise<void> {
	await requireFeaturePolicy(
		{ auth: actor },
		POLICY_ACTION_CATALOG.calendar.viewAvailability,
		{ kind: 'unscoped' },
		'personnel'
	);
}

export function createSupabasePersonnelCalendarRosterPort(
	getAdminClient: () => SupabaseClient
): PersonnelCalendarRosterPort {
	return {
		async listActive(actor) {
			await requireCalendarRosterRead(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: PERSONNEL_FIELDS,
				status: 'active'
			});
			return rows.map(toPersonnel);
		},
		async listAttributeTimelines(actor, span) {
			await requireCalendarRosterRead(actor);
			if (actor.scopeSet.kind === 'groups' && !actor.scopeSet.groupIds.length) return [];
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await getAdminClient()
					.rpc('calendar_roster_attribute_timelines', {
						p_organization_id: actor.orgId,
						p_from: span.from,
						p_through: span.through,
						p_group_ids: actor.scopeSet.kind === 'groups' ? actor.scopeSet.groupIds : null
					})
					.order('last_name')
					.order('first_name')
					.order('id')
					.range(from, to);
				if (error) throw new Error(error.message);
				return { data, error };
			});
			return (result.data ?? []).map(toAttributeTimeline);
		},
		async listAssigneeIds(actor) {
			await requireCalendarRosterRead(actor);
			const rows = await queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
				select: 'id, last_name, first_name',
				status: 'all'
			});
			return rows.map((row) => row.id as string);
		},
		async findGroupIds(actor, personnelIds) {
			await requireCalendarRosterRead(actor);
			const uniqueIds = [...new Set(personnelIds)];
			if (uniqueIds.length === 0 || (actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0)) {
				return new Map();
			}
			const lookups = [];
			for (let start = 0; start < uniqueIds.length; start += TARGETED_LOOKUP_SIZE) {
				lookups.push(
					queryScopedPersonnelRows(getAdminClient, actor.orgId, actor.scopeSet, {
						select: 'id, group_id, last_name, first_name',
						status: 'all',
						ids: uniqueIds.slice(start, start + TARGETED_LOOKUP_SIZE)
					})
				);
			}
			const pages = await Promise.all(lookups);
			return new Map(pages.flat().map((row) => [row.id as string, (row.group_id as string | null) ?? null]));
		}
	};
}

export function boundAttributeTimelines(
	people: readonly PersonnelAttributeTimeline[],
	span: { from: string; through: string },
	referencedPeople: ReadonlySet<string>
): PersonnelAttributeTimeline[] {
	return people.flatMap((person) => {
		const baseline = person.states.findLastIndex((state) => state.from <= span.from);
		const states = person.states.slice(Math.max(0, baseline)).filter((state) => state.from <= span.through);
		if (!states.some((state) => !state.archived) && !referencedPeople.has(person.id)) return [];
		const [first, ...rest] = states;
		return first ? [{ ...person, states: [first, ...rest] }] : [];
	});
}
