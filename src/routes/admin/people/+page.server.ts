import type { PageServerLoad } from './$types';
import type { PeopleFilter } from '$features/identity/contracts';
import { createPlatformPeopleOperations } from '$features/platform-admin/index.server';

export const load: PageServerLoad = async (event) => {
	const operations = await createPlatformPeopleOperations(event);
	event.depends('admin:people');
	const search = (event.url.searchParams.get('search') ?? '').trim().slice(0, 100);
	const rawFilter = event.url.searchParams.get('filter');
	const filter: PeopleFilter = rawFilter === 'notSetUp' || rawFilter === 'suspended' ? rawFilter : 'all';
	const rawPage = Number(event.url.searchParams.get('page') ?? 1);
	const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 2_147_483_647) : 1;
	return { search, filter, page, people: operations.list({ search, filter, page, limit: 20 }) };
};
