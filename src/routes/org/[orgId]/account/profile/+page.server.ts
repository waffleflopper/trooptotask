import type { Actions, PageServerLoad } from './$types';
import { createAccountProfilePage } from '$features/identity/index.server';
import { BUILT_IN_ARMY_RANK_OPTIONS } from '$features/personnel/contracts';

const page = createAccountProfilePage(BUILT_IN_ARMY_RANK_OPTIONS);
export const load = page.load satisfies PageServerLoad;
export const actions = page.actions satisfies Actions;
