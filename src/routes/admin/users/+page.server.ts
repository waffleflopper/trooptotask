import { redirect } from '@sveltejs/kit';
import type { PlatformUserDirectoryList } from '$features/platform-admin/contracts';
import type { PageServerLoad } from './$types';
import { createPlatformAccountOperations } from '$features/platform-admin/index.server';

export const load = (async (event): Promise<PlatformUserDirectoryList> => {
	await createPlatformAccountOperations(event);
	redirect(308, `/admin/people${event.url.search}`);
}) satisfies PageServerLoad;
