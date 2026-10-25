import type { Actions, PageServerLoad } from './$types';
import { loadAccountSecurityPage, accountSecurityActions } from '$features/identity/index.server';

export const load = loadAccountSecurityPage satisfies PageServerLoad;
export const actions = accountSecurityActions satisfies Actions;
