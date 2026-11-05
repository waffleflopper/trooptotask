import { z } from 'zod';
import {
	auditKind,
	changeOf,
	describeChange,
	plural,
	savedLabel,
	valueChange,
	type AuditSentenceContext
} from './shared';

const person = z.object({ record: savedLabel, subject: savedLabel, details: z.object({}) });
const personChange = z.object({
	record: savedLabel,
	subject: savedLabel,
	details: z.object({
		change: changeOf({
			name: valueChange.optional(),
			rank: valueChange.optional(),
			group: valueChange.optional(),
			mos: valueChange.optional(),
			role: valueChange.optional(),
			ets: valueChange.optional(),
			deros: valueChange.optional()
		})
	})
});
const personFields = {
	name: 'name',
	rank: 'rank',
	group: 'group',
	mos: 'MOS',
	role: 'role',
	ets: 'ETS',
	deros: 'DEROS'
};

function personEvent(verb: string, tail: string) {
	return auditKind({
		writer: 'database',
		entry: person,
		sentence: ({ record }) => `${verb} ${record}${tail}`,
		batch: { verb, one: 'person', many: 'people' }
	});
}

const group = z.object({
	record: savedLabel,
	subject: z.string().nullish(),
	details: z.object({ parent: z.string().nullable() })
});
const groupChange = z.object({
	record: savedLabel,
	subject: z.string().nullish(),
	details: z.object({
		parent: z.string().nullable(),
		change: changeOf({ name: valueChange.optional(), parent: valueChange.optional() })
	})
});
const groupBatch = (verb: string) => ({ verb, one: 'Group', many: 'Groups' });
const under = (parent: string | null) => (parent ? ` under ${parent}` : '');

const pinnedGroup = z.object({ record: savedLabel, details: z.object({}) });

const sections = z.object({
	record: savedLabel,
	subject: savedLabel,
	details: z.object({ sections: z.array(savedLabel).min(1) })
});

export const peopleKinds = {
	'personnel.created': personEvent('Added', ' to the roster'),
	'personnel.updated': auditKind({
		writer: 'database',
		entry: personChange,
		sentence: ({ record, details }, context: AuditSentenceContext) =>
			`Changed ${record}: ${describeChange(details.change, personFields, context)}`,
		batch: { verb: 'Changed', one: 'person', many: 'people' }
	}),
	'personnel.archived': personEvent('Archived', ''),
	'personnel.restored': personEvent('Restored', ' from the archive'),
	'personnel.permanently_deleted': personEvent('Permanently deleted', ''),
	'personnel.extended_info.updated': auditKind({
		writer: 'database',
		entry: sections,
		sentence: ({ record, details }) => `Updated extended info for ${record}: ${details.sections.join(', ')}`,
		batch: { verb: 'Updated extended info for', one: 'person', many: 'people' }
	}),
	'personnel.award_tracking_acknowledged': auditKind({
		writer: 'database',
		entry: person,
		sentence: ({ record }) => `Acknowledged award tracking for ${record}`,
		batch: { verb: 'Acknowledged award tracking for', one: 'person', many: 'people' }
	}),
	'personnel.award_tracking_cleared': auditKind({
		writer: 'database',
		entry: person,
		sentence: ({ record }) => `Cleared the award tracking acknowledgement for ${record}`,
		batch: { verb: 'Cleared the award tracking acknowledgement for', one: 'person', many: 'people' }
	}),
	'group.created': auditKind({
		writer: 'database',
		entry: group,
		sentence: ({ record, details }) => `Added Group ${record}${under(details.parent)}`,
		batch: groupBatch('Added')
	}),
	'group.updated': auditKind({
		writer: 'database',
		entry: groupChange,
		sentence: ({ record, details }, context) =>
			`Changed Group ${record}: ${describeChange(details.change, { name: 'name' }, context)}`,
		batch: groupBatch('Changed')
	}),
	'group.moved': auditKind({
		writer: 'database',
		entry: groupChange,
		sentence: ({ record, details }) => {
			const { parent, name } = details.change;
			const place = `from ${parent?.from ?? 'the top level'} to ${parent?.to ?? 'the top level'}`;
			return `Moved Group ${record} ${place}${name ? `, renamed from ${name.from}` : ''}`;
		},
		batch: groupBatch('Moved')
	}),
	'group.deleted': auditKind({
		writer: 'database',
		entry: group,
		sentence: ({ record }) => `Deleted Group ${record}`,
		batch: groupBatch('Deleted')
	}),
	'group.reordered': auditKind({
		writer: 'app',
		entry: z.object({ details: z.object({ count: z.number().int().positive() }) }),
		sentence: ({ details }) => `Reordered ${plural(details.count, 'Group', 'Groups')}`,
		batch: { verb: 'Reordered', one: 'Group list', many: 'Group lists' }
	}),
	'pinned_group.created': auditKind({
		writer: 'database',
		entry: pinnedGroup,
		sentence: ({ record }) => `Pinned Group ${record}`,
		batch: { verb: 'Pinned', one: 'Group', many: 'Groups' }
	}),
	'pinned_group.deleted': auditKind({
		writer: 'database',
		entry: pinnedGroup,
		sentence: ({ record }) => `Unpinned Group ${record}`,
		batch: { verb: 'Unpinned', one: 'Group', many: 'Groups' }
	})
} as const;
