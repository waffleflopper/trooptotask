import type { SupabaseClient } from '@supabase/supabase-js';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import { evaluatePolicyDecision } from '$lib/access/policyEvaluator';
import { coverageWindowStart } from './counselingCoverage';
import type { AttentionInput, ReadinessSourceResult } from './personnelReadiness.types';
import {
	buildPersonSignalCore,
	signalAccessBy,
	SIGNAL_SOURCES,
	type Known,
	type OpenFollowUp,
	type RosterSignalRead,
	type RosterSignalSlices,
	type RosterSourceQuery,
	type RosterSourceRead,
	type RosterStatusType,
	type SignalAccess,
	type SignalSource,
	type TodayStatus
} from './rosterSignals';

type Facts<K extends 'training' | 'criticalTasks' | 'evaluation'> = Extract<AttentionInput[K], { ok: true }>['value'];

export interface RosterSignalSources {
	availability(
		query: RosterSourceQuery
	): Promise<{ statusTypes: RosterStatusType[]; today: RosterSourceRead<TodayStatus> }>;
	training(query: RosterSourceQuery): Promise<RosterSourceRead<Facts<'training'>>>;
	criticalTasks(query: RosterSourceQuery): Promise<RosterSourceRead<Facts<'criticalTasks'>>>;
	evaluations(query: RosterSourceQuery): Promise<RosterSourceRead<Facts<'evaluation'>>>;
	followUps(query: RosterSourceQuery): Promise<RosterSourceRead<readonly OpenFollowUp[]>>;
	counseling(query: RosterSourceQuery): Promise<RosterSourceRead<readonly string[]>>;
}

export function resolveSignalAccess(
	auth: Pick<OrganizationAccessGrant, 'role' | 'userId' | 'capabilityMap' | 'scopeSet'>,
	disabledFeatures: readonly FeatureKey[]
): SignalAccess {
	return signalAccessBy(
		(action) =>
			evaluatePolicyDecision({
				decisionKind: 'server-authoritative',
				actor: { membershipRole: auth.role, userId: auth.userId },
				action,
				capabilityMap: auth.capabilityMap,
				scopeSet: auth.scopeSet,
				resource: { kind: 'unscoped' }
			}).allowed,
		disabledFeatures
	);
}

const WITHHELD = { ok: false, off: true } as const;

function result<T>(read: RosterSourceRead<T> | null, id: string): ReadinessSourceResult<T> {
	return read?.has(id) ? { ok: true, value: read.get(id) as T } : WITHHELD;
}

function known<T>(read: RosterSourceRead<T> | null | undefined, id: string): Known<T> {
	return read?.has(id) ? { kind: 'known', value: read.get(id) as T } : { kind: 'withheld' };
}

/** Read permitted sources together for the whole visible roster or the listed People. */
export async function loadRosterSignals(
	ctx: { access: SignalAccess; sources: RosterSignalSources },
	query: RosterSourceQuery
): Promise<RosterSignalRead> {
	const { access, sources } = ctx;
	const when = <T>(source: SignalSource, read: () => Promise<T>) => (access[source] ? read() : null);
	const [presence, training, criticalTasks, evaluations, followUps, counseling] = await Promise.all([
		when('availability', () => sources.availability(query)),
		when('training', () => sources.training(query)),
		when('criticalTasks', () => sources.criticalTasks(query)),
		when('evaluations', () => sources.evaluations(query)),
		when('followUps', () => sources.followUps(query)),
		when('counseling', () => sources.counseling(query))
	]);

	const ids = new Set<string>();
	for (const read of [presence?.today, training, criticalTasks, evaluations, followUps, counseling]) {
		for (const id of read?.keys() ?? []) ids.add(id);
	}
	return {
		asOf: query.asOf,
		access,
		statusTypes: presence?.statusTypes ?? [],
		people: [...ids].map((personnelId) =>
			buildPersonSignalCore({
				personnelId,
				asOf: query.asOf,
				today: known(presence?.today, personnelId),
				training: result(training, personnelId),
				criticalTasks: result(criticalTasks, personnelId),
				evaluation: result(evaluations, personnelId),
				openFollowUps: known(followUps, personnelId),
				counselingDates: known(counseling, personnelId)
			})
		)
	};
}

type SignalSlice = Partial<Record<SignalSource, unknown>>;

/** Share one authorized database statement across this request's source readers. */
export function createSupabaseRosterSignalSlices(
	client: SupabaseClient,
	orgId: string,
	access: SignalAccess
): RosterSignalSlices {
	let current: { query: RosterSourceQuery; read: Promise<SignalSlice> } | undefined;
	const read = async ({ asOf, personnelIds }: RosterSourceQuery) => {
		const { data, error } = await client.rpc('roster_signals', {
			p_organization_id: orgId,
			p_as_of: asOf,
			p_since: coverageWindowStart(asOf),
			p_sources: (Object.keys(SIGNAL_SOURCES) as SignalSource[]).filter((source) => access[source]),
			p_personnel_ids: personnelIds
		});
		if (error) throw new Error(error.message);
		return data as SignalSlice;
	};
	return async (source, query) => {
		if (current?.query !== query) current = { query, read: read(query) };
		return (await current.read)[source];
	};
}

/** Open follow-ups, soonest due first, for each visible active Person a Personnel configurer may read. */
export function createSupabaseRosterFollowUpSignals(slices: RosterSignalSlices) {
	return async (query: RosterSourceQuery): Promise<RosterSourceRead<OpenFollowUp[]>> => {
		const read = (await slices('followUps', query)) as {
			cohort: string[];
			open: [id: string, personnelId: string, title: string, dueDate: string | null][];
		};
		const byPerson = new Map<string, OpenFollowUp[]>(read.cohort.map((id) => [id, []]));
		for (const [id, personnelId, title, dueDate] of read.open) byPerson.get(personnelId)?.push({ id, title, dueDate });
		return byPerson;
	};
}

/** The latest held counseling inside the coverage window, for each visible active Person a configurer may read. */
export function createSupabaseRosterCounselingSignals(slices: RosterSignalSlices) {
	return async (query: RosterSourceQuery): Promise<RosterSourceRead<string[]>> => {
		const read = (await slices('counseling', query)) as {
			cohort: string[];
			latest: [personnelId: string, conductedOn: string][];
		};
		const byPerson = new Map<string, string[]>(read.cohort.map((id) => [id, []]));
		for (const [personnelId, conductedOn] of read.latest) byPerson.set(personnelId, [conductedOn]);
		return byPerson;
	};
}
