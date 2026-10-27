import { z } from 'zod';

export const setupBranchSchema = z.enum([
	'army',
	'navy',
	'air-force',
	'marine-corps',
	'coast-guard',
	'space-force',
	'civilian',
	'custom'
]);
export type SetupBranch = z.infer<typeof setupBranchSchema>;
