import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { SignInRoster } from './sign-in-rosters.types';
import { sanitizeFilterConfig, type PreparedSignInRosterSnapshot } from './snapshot.server';

export interface SignInRosterListInput {
	title: string;
	/** Inclusive lower bound on `created_at`, an ISO instant. */
	createdFrom: string | null;
	/** Exclusive upper bound on `created_at`, an ISO instant. */
	createdBefore: string | null;
	limit: number;
	offset: number;
}

export interface SignInRosterCreateInput {
	title: string;
	rosterDate: unknown;
	blankDate: unknown;
	separateByGroup: unknown;
	sortBy: PreparedSignInRosterSnapshot['sortBy'];
	personnelSnapshot: PreparedSignInRosterSnapshot['personnelSnapshot'];
	personnelIds: string[];
	scopeGroupIds: string[];
	filterConfig: PreparedSignInRosterSnapshot['filterConfig'];
	createdBy: string;
}

export interface SignInRosterPersistence {
	/** `count` and `unsigned` cover every roster matching the filters, not just the page; `unsigned` lacks a signed scan. */
	list(input: SignInRosterListInput): Promise<{ data: SignInRoster[]; count: number | null; unsigned: number }>;
	find(id: string): Promise<SignInRoster | null>;
	create(input: SignInRosterCreateInput): Promise<SignInRoster>;
}

interface RosterRow {
	id: string;
	title: string;
	roster_date: SignInRoster['rosterDate'];
	blank_date: boolean;
	separate_by_group: boolean;
	sort_by: SignInRoster['sortBy'];
	personnel_snapshot: SignInRoster['personnelSnapshot'];
	filter_config: unknown;
	signed_file_path: string | null;
	created_by: string;
	created_at: string;
}

const ROSTER_FIELDS =
	'id,title,roster_date,blank_date,separate_by_group,sort_by,personnel_snapshot,filter_config,signed_file_path,created_by,created_at';

function toRoster(row: RosterRow): SignInRoster {
	return {
		id: row.id,
		title: row.title,
		rosterDate: row.roster_date,
		blankDate: row.blank_date,
		separateByGroup: row.separate_by_group,
		sortBy: row.sort_by,
		personnelSnapshot: row.personnel_snapshot,
		filterConfig: sanitizeFilterConfig(row.filter_config),
		signedFilePath: row.signed_file_path,
		createdBy: row.created_by,
		createdAt: row.created_at
	};
}

export function createSupabaseSignInRosterPersistence(
	client: SupabaseClient,
	{ orgId, scopeSet }: { orgId: string; scopeSet: ScopeSet }
): SignInRosterPersistence {
	const groupIds = scopeSet.kind === 'groups' ? [...new Set(scopeSet.groupIds.filter(Boolean))] : null;

	function read(options?: { count: 'exact'; head?: boolean }) {
		let query = client.from('sign_in_rosters').select(ROSTER_FIELDS, options).eq('organization_id', orgId);
		if (groupIds) query = query.containedBy('scope_group_ids', groupIds).not('scope_group_ids', 'eq', '{}');
		return query;
	}

	return {
		async list(input) {
			if (groupIds?.length === 0) return { data: [], count: 0, unsigned: 0 };
			const matching = (options: { count: 'exact'; head?: boolean }) => {
				let query = read(options);
				if (input.title) query = query.ilike('title', `%${input.title}%`);
				if (input.createdFrom) query = query.gte('created_at', input.createdFrom);
				if (input.createdBefore) query = query.lt('created_at', input.createdBefore);
				return query;
			};
			const [page, missing] = await Promise.all([
				matching({ count: 'exact' })
					.order('created_at', { ascending: false })
					.order('id', { ascending: true })
					.range(input.offset, input.offset + input.limit - 1),
				matching({ count: 'exact', head: true }).is('signed_file_path', null)
			]);
			if (page.error) throw new Error(page.error.message);
			if (missing.error) throw new Error(missing.error.message);
			return {
				data: ((page.data ?? []) as RosterRow[]).map(toRoster),
				count: page.count ?? null,
				unsigned: missing.count ?? 0
			};
		},
		async find(id) {
			if (groupIds?.length === 0) return null;
			const query = read().eq('id', id);
			if (groupIds) {
				const { data, error } = await query.limit(1);
				if (error) throw new Error(error.message);
				return data?.[0] ? toRoster(data[0] as RosterRow) : null;
			}
			const { data, error } = await query.single();
			if (error) {
				if (error.code === 'PGRST116') return null;
				throw new Error(error.message);
			}
			return data ? toRoster(data as RosterRow) : null;
		},
		async create(input) {
			const { data, error } = await client
				.from('sign_in_rosters')
				.insert({
					organization_id: orgId,
					title: input.title,
					roster_date: input.rosterDate,
					blank_date: input.blankDate,
					separate_by_group: input.separateByGroup,
					sort_by: input.sortBy,
					personnel_snapshot: input.personnelSnapshot,
					personnel_ids: input.personnelIds,
					scope_group_ids: input.scopeGroupIds,
					filter_config: input.filterConfig,
					signed_file_path: null,
					created_by: input.createdBy
				})
				.select(ROSTER_FIELDS)
				.single();
			if (error) throw new Error(error.message);
			return toRoster(data as RosterRow);
		}
	};
}
