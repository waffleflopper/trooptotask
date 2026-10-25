import { PEOPLE_SORT, parseAdminSort } from '$features/platform-admin/adminSort';
import type { PageServerLoad } from './$types';
import type { PeopleFilter } from '$features/identity/contracts';
import { createPlatformPeopleOperations } from '$features/platform-admin/index.server';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformPeopleOperations(event);
	event.depends('admin:people');
	const search = (event.url.searchParams.get('search') ?? '').trim().slice(0, 100);
	const rawFilter = event.url.searchParams.get('filter');
	const filter: PeopleFilter = rawFilter === 'notSetUp' || rawFilter === 'suspended' ? rawFilter : 'all';
	const sort = parseAdminSort(PEOPLE_SORT, event.url.searchParams);
	const rawPage = Number(event.url.searchParams.get('page') ?? 1);
	const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 2_147_483_647) : 1;
	return { search, filter, sort, page, people: operations.list({ search, filter, sort, page, limit: 20 }) };
};
