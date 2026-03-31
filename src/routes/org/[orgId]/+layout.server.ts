import type { LayoutServerLoad } from './$types';
import { createRootOrgLayoutLoad } from '$lib/server/core/useCases/createRootOrgLayoutLoad';

export const load: LayoutServerLoad = createRootOrgLayoutLoad();
