import type { LayoutServerLoad } from './$types';
import { loadSetupLayout } from './setupLoad.server';

export const load: LayoutServerLoad = loadSetupLayout;
