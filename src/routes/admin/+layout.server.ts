import type { LayoutServerLoad } from './$types';
import { loadPlatformAdminNavigation } from '$features/platform-admin/index.server';

export const load: LayoutServerLoad = (event) => loadPlatformAdminNavigation(event);
