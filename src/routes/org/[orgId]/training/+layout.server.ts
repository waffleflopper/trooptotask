import type { LayoutServerLoad } from './$types';
import { createOrgLayoutLoad } from '$lib/server/core/useCases/createOrgLayoutLoad';
import type { TrainingBootstrap } from '$lib/server/core/useCases/trainingQuery';

export const load: LayoutServerLoad = createOrgLayoutLoad<TrainingBootstrap>({
	workspace: 'training',
	depends: ['app:org-core', 'app:training-data']
});
