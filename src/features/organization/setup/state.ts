import { z } from 'zod';
import { SETUP_STEPS, type SetupStepKey } from './registry';

import { setupBranchSchema, type SetupBranch } from './branch';
export { setupBranchSchema, type SetupBranch } from './branch';
export const setupStepKeySchema = z.enum(SETUP_STEPS.map((step) => step.key));
export const setupAnswerSchema = z.enum(['reviewed', 'later']);
export const setupPromptStateSchema = z.union([
	z.object({ snoozedUntil: z.iso.date() }).strict(),
	z.object({ never: z.literal(true) }).strict()
]);
export type SetupAnswer = z.infer<typeof setupAnswerSchema>;
export type SetupPromptState = z.infer<typeof setupPromptStateSchema>;
export type SetupPromptKey = 'setup' | SetupStepKey;
export interface OrganizationSetup {
	branch: SetupBranch | null;
	answers: Partial<Record<SetupStepKey, SetupAnswer>>;
	finishedAt: string | null;
	prompts: Partial<Record<SetupPromptKey, SetupPromptState>>;
}

const unknownEntries = z.record(z.string(), z.unknown()).catch({});
const setupPromptKeySchema = z.union([z.literal('setup'), setupStepKeySchema]);
export const setupPromptChoiceInputSchema = z
	.object({ key: setupPromptKeySchema, choice: z.enum(['tomorrow', 'never']) })
	.strict();
const storedStateSchema = z.object({
	branch: setupBranchSchema.nullable().catch(null),
	answers: unknownEntries.transform((entries) => {
		const answers: OrganizationSetup['answers'] = {};
		for (const [rawKey, rawValue] of Object.entries(entries)) {
			const key = setupStepKeySchema.safeParse(rawKey);
			const value = setupAnswerSchema.safeParse(rawValue);
			if (key.success && value.success) answers[key.data] = value.data;
		}
		return answers;
	}),
	finishedAt: z.iso.datetime({ offset: true }).nullable().catch(null),
	prompts: unknownEntries.transform((entries) => {
		const prompts: OrganizationSetup['prompts'] = {};
		for (const [rawKey, rawValue] of Object.entries(entries)) {
			const key = setupPromptKeySchema.safeParse(rawKey);
			const value = setupPromptStateSchema.safeParse(rawValue);
			if (key.success && value.success) prompts[key.data] = value.data;
		}
		return prompts;
	})
});

export function parseOrganizationSetup(value: unknown): OrganizationSetup {
	return storedStateSchema.parse(z.record(z.string(), z.unknown()).catch({}).parse(value));
}

export const setupAnswerInputSchema = z
	.object({ step: setupStepKeySchema, answer: setupAnswerSchema.nullable() })
	.strict();
export const setupBranchInputSchema = z.object({ branch: setupBranchSchema.nullable() }).strict();
export const setupFinishInputSchema = z.object({}).strict();
export const setupPromptInputSchema = z
	.object({ key: setupPromptKeySchema, state: setupPromptStateSchema.nullable() })
	.strict();
