import { z } from 'zod';
import { auditKind, lifecycle, plural, savedLabel } from './shared';

const stepType = z.enum(['training', 'paperwork', 'checkbox']);

const template = lifecycle({
	writer: 'database',
	noun: 'onboarding template',
	plural: 'onboarding templates',
	fields: { name: 'name' },
	flags: { description: 'description' }
});

const templateStep = lifecycle({
	writer: 'database',
	noun: 'onboarding step',
	plural: 'onboarding steps',
	details: { template: savedLabel, stepType },
	fields: { name: 'name', stepType: 'type' },
	flags: { description: 'description', stages: 'stages', trainingType: 'training type' },
	suffix: ({ template: name }) => ` in ${name}`
});

const packet = z.object({
	record: savedLabel,
	subject: savedLabel,
	details: z.object({ template: z.string().nullable() })
});
const onTemplate = (template: string | null) => (template ? ` (${template})` : '');
const packetKind = (verb: string) =>
	auditKind({
		writer: 'database',
		entry: packet,
		sentence: ({ subject, details }) => `${verb} onboarding for ${subject}${onTemplate(details.template)}`,
		batch: { verb, one: 'onboarding for a person', many: 'onboardings for people' }
	});

const step = z.object({ record: savedLabel, subject: savedLabel, details: z.object({}) });
const stepKind = (sentence: (record: string, subject: string) => string, verb: string) =>
	auditKind({
		writer: 'database',
		entry: step,
		sentence: ({ record, subject }) => sentence(record, subject),
		batch: { verb, one: 'onboarding step', many: 'onboarding steps' }
	});

export const onboardingKinds = {
	'onboarding_template.created': template.created,
	'onboarding_template.updated': template.updated,
	'onboarding_template.deleted': template.deleted,
	'onboarding_template_step.created': templateStep.created,
	'onboarding_template_step.updated': templateStep.updated,
	'onboarding_template_step.deleted': templateStep.deleted,
	'onboarding_template_step.reordered': auditKind({
		writer: 'app',
		entry: z.object({ record: savedLabel, details: z.object({ count: z.number().int().positive() }) }),
		sentence: ({ record, details }) =>
			`Reordered ${plural(details.count, 'onboarding step', 'onboarding steps')} in ${record}`,
		batch: { verb: 'Reordered', one: 'onboarding step list', many: 'onboarding step lists' }
	}),
	'onboarding.started': packetKind('Started'),
	'onboarding.cancelled': packetKind('Cancelled'),
	'onboarding.reopened': packetKind('Reopened'),
	'onboarding.completed': auditKind({
		writer: 'database',
		entry: z.object({
			record: savedLabel,
			subject: savedLabel,
			details: z.object({ template: z.string().nullable(), incomplete: z.number().int().nonnegative() })
		}),
		sentence: ({ subject, details }) =>
			`Completed onboarding for ${subject}${onTemplate(details.template)}${
				details.incomplete > 0 ? ` with ${plural(details.incomplete, 'step', 'steps')} unfinished` : ''
			}`,
		batch: { verb: 'Completed', one: 'onboarding for a person', many: 'onboardings for people' }
	}),
	'onboarding.template_switched': auditKind({
		writer: 'database',
		entry: z.object({
			record: savedLabel,
			subject: savedLabel,
			details: z.object({ template: z.string().nullable(), previousTemplate: z.string().nullable() })
		}),
		sentence: ({ subject, details }) =>
			`Switched onboarding for ${subject} from ${details.previousTemplate ?? 'no template'} to ${details.template ?? 'no template'}`,
		batch: { verb: 'Switched', one: 'onboarding for a person', many: 'onboardings for people' }
	}),
	'onboarding.resynced': auditKind({
		writer: 'app',
		entry: z.object({ subject: savedLabel, details: z.object({}) }),
		sentence: ({ subject }) => `Updated onboarding for ${subject} from its template`,
		batch: { verb: 'Updated', one: 'onboarding from its template', many: 'onboardings from their templates' }
	}),
	'onboarding_step.stage_advanced': auditKind({
		writer: 'database',
		entry: z.object({
			record: savedLabel,
			subject: savedLabel,
			details: z.object({ stage: z.string().nullable(), completed: z.boolean() })
		}),
		sentence: ({ record, subject, details }) =>
			`Moved onboarding step ${record} for ${subject} to ${details.stage ?? 'no stage'}${details.completed ? ', completing it' : ''}`,
		batch: { verb: 'Advanced', one: 'onboarding step', many: 'onboarding steps' }
	}),
	'onboarding_step.toggled': auditKind({
		writer: 'database',
		entry: z.object({ record: savedLabel, subject: savedLabel, details: z.object({ completed: z.boolean() }) }),
		sentence: ({ record, subject, details }) =>
			`Marked onboarding step ${record} for ${subject} ${details.completed ? 'complete' : 'incomplete'}`,
		batch: { verb: 'Marked', one: 'onboarding step', many: 'onboarding steps' }
	}),
	'onboarding_step.note_added': stepKind(
		(record, subject) => `Added a note to onboarding step ${record} for ${subject}`,
		'Added a note to'
	),
	'onboarding_step.inactive_removed': stepKind(
		(record, subject) => `Removed inactive onboarding step ${record} for ${subject}`,
		'Removed'
	)
} as const;
