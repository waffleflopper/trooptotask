import { z } from 'zod';
import { auditKind, savedLabel } from './shared';

const aboutPerson = z.object({ subject: savedLabel, details: z.object({}) });

/**
 * A change to a record that belongs to one person, written by the database with the change. Titles and text are never
 * kept, the entry names whose record it was.
 */
const onRecord = (verb: string, noun: string) =>
	auditKind({
		writer: 'database',
		entry: aboutPerson,
		sentence: ({ subject }) => `${verb} a ${noun} for ${subject}`,
		batch: { verb, one: noun, many: `${noun}s` }
	});

export const personRecordKinds = {
	'personnel.counseling_record.created': onRecord('Added', 'counseling record'),
	'personnel.counseling_record.updated': onRecord('Changed', 'counseling record'),
	'personnel.counseling_record.archived': onRecord('Archived', 'counseling record'),
	'personnel.counseling_record.restored': onRecord('Restored', 'counseling record'),
	'personnel.counseling_record.deleted': onRecord('Deleted', 'counseling record'),
	'personnel.document.created': onRecord('Added', 'document'),
	'personnel.document.updated': onRecord('Changed', 'document'),
	'personnel.document.archived': onRecord('Archived', 'document'),
	'personnel.document.restored': onRecord('Restored', 'document'),
	'personnel.document.deleted': onRecord('Deleted', 'document'),
	'personnel.leader_note.created': onRecord('Added', 'leader note'),
	'personnel.leader_note.updated': onRecord('Changed', 'leader note'),
	'personnel.leader_note.archived': onRecord('Archived', 'leader note'),
	'personnel.leader_note.restored': onRecord('Restored', 'leader note'),
	'personnel.leader_note.deleted': onRecord('Deleted', 'leader note'),
	'personnel.follow_up.created': onRecord('Added', 'follow-up'),
	'personnel.follow_up.updated': onRecord('Changed', 'follow-up'),
	'personnel.follow_up.completed': onRecord('Completed', 'follow-up'),
	'personnel.follow_up.reopened': onRecord('Reopened', 'follow-up'),
	'personnel.follow_up.archived': onRecord('Archived', 'follow-up'),
	'personnel.follow_up.restored': onRecord('Restored', 'follow-up'),
	'personnel.follow_up.deleted': onRecord('Deleted', 'follow-up'),
	'personnel.exported': auditKind({
		writer: 'app',
		entry: aboutPerson,
		sentence: ({ subject }) => `Exported the record of ${subject}`,
		batch: { verb: 'Exported', one: 'person record', many: 'person records' }
	})
} as const;
