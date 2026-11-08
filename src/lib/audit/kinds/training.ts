import { z } from 'zod';
import { dateOnlySchema } from '$lib/utils/inputSchemas';
import {
	archiveState,
	auditKind,
	changeOf,
	day,
	describeChange,
	flagged,
	lifecycle,
	plural,
	savedLabel,
	valueChange
} from './shared';

const trainingType = lifecycle({
	writer: 'database',
	noun: 'training type',
	plural: 'training types',
	fields: {
		name: 'name',
		expirationMonths: 'expires after (months)',
		warningDaysYellow: 'yellow warning (days)',
		warningDaysOrange: 'orange warning (days)',
		color: 'color',
		expirationDateOnly: 'expiration date only',
		canBeExempted: 'allows exemptions',
		isOptional: 'optional'
	},
	flags: { audience: 'who it applies to', description: 'description' }
});

const trainingView = lifecycle({
	writer: 'database',
	noun: 'training view',
	plural: 'training views',
	fields: { name: 'name' },
	flags: { columns: 'columns' }
});

const trainingRecord = lifecycle({
	writer: 'database',
	noun: 'training record',
	plural: 'training records',
	about: true,
	details: { completionDate: dateOnlySchema.nullable(), expirationDate: dateOnlySchema.nullable() },
	fields: { completionDate: 'completed', expirationDate: 'expires' },
	flags: { notes: 'notes', certificate: 'certificate' },
	suffix: ({ completionDate }, context) => (completionDate ? `, completed ${day(completionDate, context)}` : '')
});

const historyFields = { completionDate: 'completed', expirationDate: 'expires' };
const historyFlags = { notes: 'notes', certificate: 'certificate' };

const exemption = z.object({ record: savedLabel, subject: savedLabel, details: z.object({}) });

export const trainingKinds = {
	'training_type.created': trainingType.created,
	'training_type.updated': trainingType.updated,
	'training_type.archived': archiveState('Archived', 'training type', 'training types'),
	'training_type.restored': archiveState('Restored', 'training type', 'training types'),
	'training_type.deleted': trainingType.deleted,
	'training_type.exemption_added': auditKind({
		writer: 'database',
		entry: exemption,
		sentence: ({ record, subject }) => `Exempted ${subject} from ${record}`,
		batch: { verb: 'Exempted from a training type', one: 'person', many: 'people' }
	}),
	'training_type.exemption_removed': auditKind({
		writer: 'database',
		entry: exemption,
		sentence: ({ record, subject }) => `Removed the exemption of ${subject} from ${record}`,
		batch: { verb: 'Removed an exemption from a training type for', one: 'person', many: 'people' }
	}),
	'training_type.reordered': auditKind({
		writer: 'app',
		entry: z.object({ details: z.object({ count: z.number().int().positive() }) }),
		sentence: ({ details }) => `Reordered ${plural(details.count, 'training type', 'training types')}`,
		batch: { verb: 'Reordered', one: 'training type list', many: 'training type lists' }
	}),
	'training_view.created': trainingView.created,
	'training_view.updated': trainingView.updated,
	'training_view.deleted': trainingView.deleted,
	'training_record.created': trainingRecord.created,
	'training_record.updated': trainingRecord.updated,
	'training_record.deleted': trainingRecord.deleted,
	'training_record.history_corrected': auditKind({
		writer: 'database',
		entry: z.object({
			record: savedLabel,
			subject: savedLabel,
			details: z.object({
				change: changeOf({
					completionDate: valueChange.optional(),
					expirationDate: valueChange.optional(),
					notes: flagged.optional(),
					certificate: flagged.optional()
				})
			})
		}),
		sentence: ({ record, subject, details }, context) =>
			`Corrected a past completion of ${record} for ${subject}: ${describeChange(details.change, historyFields, context, historyFlags)}`,
		batch: { verb: 'Corrected', one: 'past training record', many: 'past training records' }
	})
} as const;
