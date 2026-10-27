import { z } from 'zod';
import { setupBranchSchema, type SetupBranch } from '$features/organization/contracts';

const armySuggestions = [
	{ id: 'sharp', name: 'SHARP', expirationMonths: 12 },
	{ id: 'eo', name: 'Equal Opportunity', expirationMonths: 12 },
	{ id: 'ace', name: 'Suicide Prevention (ACE)', expirationMonths: 12 },
	{ id: 'cyber-awareness', name: 'Cyber Awareness Challenge', expirationMonths: 12 },
	{ id: 'tarp', name: 'Threat Awareness and Reporting', expirationMonths: 12 },
	{ id: 'opsec', name: 'OPSEC', expirationMonths: 12 },
	{ id: 'at-level-i', name: 'Antiterrorism Level I', expirationMonths: 12 },
	{ id: 'ctip', name: 'Combating Trafficking in Persons', expirationMonths: 12 }
] as const;

export type TrainingSuggestion = (typeof armySuggestions)[number];
const suggestionsByBranch: Partial<Record<SetupBranch, readonly TrainingSuggestion[]>> = {
	army: armySuggestions
};

export function getTrainingSuggestions(branch: SetupBranch | null): readonly TrainingSuggestion[] {
	return branch === null ? [] : (suggestionsByBranch[branch] ?? []);
}

export const trainingSuggestionsInputSchema = z
	.object({
		branch: setupBranchSchema.nullable(),
		suggestionIds: z.array(z.enum(armySuggestions.map((suggestion) => suggestion.id))).max(armySuggestions.length)
	})
	.refine(
		({ branch, suggestionIds }) =>
			suggestionIds.every((id) => getTrainingSuggestions(branch).some((suggestion) => suggestion.id === id)),
		{ message: 'Choose suggestions for this branch', path: ['suggestionIds'] }
	);

export type TrainingSuggestionsInput = z.infer<typeof trainingSuggestionsInputSchema>;
