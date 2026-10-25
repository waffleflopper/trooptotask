import { PEOPLE_SORT_KEYS, type PeopleSortKey } from '$features/identity/contracts';
import { PLATFORM_ORGANIZATION_SORT_KEYS, type PlatformOrganizationSortKey } from './organizationSupportTypes';

export type AdminSortDirection = 'asc' | 'desc';

export interface AdminSort<K extends string> {
	key: K;
	direction: AdminSortDirection;
}

export interface AdminSortSpec<K extends string> {
	keys: readonly K[];
	/** The direction a column sorts in when first picked: text A to Z, counts and dates largest or newest first. */
	first: Record<K, AdminSortDirection>;
	fallback: AdminSort<K>;
}

export const PEOPLE_SORT: AdminSortSpec<PeopleSortKey> = {
	keys: PEOPLE_SORT_KEYS,
	first: { person: 'asc', organizations: 'desc', lastSignIn: 'desc', status: 'asc', added: 'desc' },
	fallback: { key: 'added', direction: 'desc' }
};

export const ORGANIZATION_SORT: AdminSortSpec<PlatformOrganizationSortKey> = {
	keys: PLATFORM_ORGANIZATION_SORT_KEYS,
	first: {
		name: 'asc',
		owner: 'asc',
		members: 'desc',
		personnel: 'desc',
		lastActive: 'desc',
		created: 'desc',
		status: 'asc'
	},
	fallback: { key: 'lastActive', direction: 'desc' }
};

/** Reads `sort` and `dir`. An unknown key falls back; a missing or unknown direction takes the key's first direction. */
export function parseAdminSort<K extends string>(spec: AdminSortSpec<K>, params: URLSearchParams): AdminSort<K> {
	const key = params.get('sort');
	if (!spec.keys.includes(key as K)) return spec.fallback;
	const dir = params.get('dir');
	return { key: key as K, direction: dir === 'asc' || dir === 'desc' ? dir : spec.first[key as K] };
}

/** Writes `sort` and `dir`, leaving both out for the default order so the plain URL stays plain. */
export function writeAdminSort<K extends string>(
	spec: AdminSortSpec<K>,
	sort: AdminSort<K>,
	params: URLSearchParams
): void {
	if (sort.key === spec.fallback.key && sort.direction === spec.fallback.direction) return;
	params.set('sort', sort.key);
	params.set('dir', sort.direction);
}

/** The same column flips direction; another column starts in its first direction. */
export function nextAdminSort<K extends string>(spec: AdminSortSpec<K>, current: AdminSort<K>, key: K): AdminSort<K> {
	if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
	return { key, direction: spec.first[key] };
}
