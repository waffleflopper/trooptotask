import type { PageServerLoad } from './$types';
import { loadPlatformAdminNavigation } from '$features/platform-admin/index.server';
export const load: PageServerLoad = (event) => loadPlatformAdminNavigation(event);
