import { isHttpError } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { RequestFailure } from '$lib/errors';
import type { TrainingCatalogPersistence, TrainingSuggestionsResult } from '../contracts';
import { getTrainingSuggestions, type TrainingSuggestionsInput } from '../trainingSuggestions';
import { createTrainingType } from './trainingCatalogOperations.server';
import type { TrainingTypeCreateContext } from './trainingCatalogPorts.server';

type TrainingSuggestionsContext = TrainingTypeCreateContext & {
	readonly trainingCatalog: Pick<TrainingCatalogPersistence, 'listTypes' | 'findTypeByName' | 'createType'>;
};

export async function applyTrainingSuggestions(
	ctx: TrainingSuggestionsContext,
	input: TrainingSuggestionsInput
): Promise<TrainingSuggestionsResult> {
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.training.configureRequirements,
		{ kind: 'organization' },
		'training_type'
	);
	const saved = await ctx.trainingCatalog.listTypes();
	const existingNames = new Set(saved.map((type) => type.name));
	const nextSortOrder = saved.reduce((next, type) => Math.max(next, type.sortOrder + 1), 0);
	const picked = getTrainingSuggestions(input.branch).filter((suggestion) =>
		input.suggestionIds.includes(suggestion.id)
	);
	const outcomes = await Promise.allSettled(
		picked.map(async (suggestion, index) => {
			if (existingNames.has(suggestion.name)) return { kind: 'skipped', suggestion } as const;
			try {
				await createTrainingType(ctx, {
					name: suggestion.name,
					expirationMonths: suggestion.expirationMonths,
					sortOrder: nextSortOrder + index
				});
				return { kind: 'created', suggestion } as const;
			} catch (error) {
				if (isHttpError(error) || error instanceof RequestFailure) {
					if (error.status === 401 || error.status === 403) throw error;
					if (error.status === 409) {
						try {
							if (await ctx.trainingCatalog.findTypeByName(suggestion.name)) {
								return { kind: 'skipped', suggestion } as const;
							}
						} catch {
							// A failed conflict read is reported with the failed pick so the owner can retry.
						}
					}
				}
				return { kind: 'failed', suggestion } as const;
			}
		})
	);
	const resolved = outcomes.map((outcome) => {
		if (outcome.status === 'rejected') throw outcome.reason;
		return outcome.value;
	});
	const result: TrainingSuggestionsResult = {
		created: [],
		skipped: [],
		failed: [],
		trainingTypes: await ctx.trainingCatalog.listTypes()
	};
	for (const outcome of resolved) {
		if (outcome.kind === 'failed') {
			result.failed.push({ ...outcome.suggestion, message: 'This training type could not be created. Try again.' });
		} else {
			result[outcome.kind].push(outcome.suggestion);
		}
	}
	return result;
}
