import { createRequestTrainingRosterContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { importTrainingRecords } from '$features/training/index.server';
import { DATE_ONLY_MESSAGE } from '$lib/utils/inputSchemas';
import { z } from 'zod';

import type { TrainingBatchImportInput } from '$features/training/contracts';

const RECORD_TARGET_MESSAGE = 'Each record must name a Person and Training type by ID';

const batchInput = z.object({
	records: z.array(
		z.object(
			{
				personnelId: z.string({ error: RECORD_TARGET_MESSAGE }),
				trainingTypeId: z.string({ error: RECORD_TARGET_MESSAGE }),
				completionDate: z.string({ error: DATE_ONLY_MESSAGE }).nullable().default(null),
				notes: z
					.string({ error: 'Notes must be text' })
					.nullish()
					.transform((notes) => notes ?? undefined),
				status: z.enum(['completed', 'exempt'], { error: 'Status must be completed or exempt' })
			},
			{ error: RECORD_TARGET_MESSAGE }
		),
		{ error: 'records array is required' }
	)
});

export const _postConfig = {
	context: createRequestTrainingRosterContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	input: batchInput,
	fn: (ctx, input) => importTrainingRecords(ctx, input)
} satisfies RouteConfig<TrainingBatchImportInput, unknown, ReturnType<typeof createRequestTrainingRosterContext>>;

export const POST = handle(_postConfig);
