import { describe, expect, it } from 'vitest';
import { AUDIT_KINDS, batchSentence, catalogSentence, type AuditKindName, type SavedAuditEntry } from './catalog';

const context = { loggedOn: '2026-11-05' };

/** A complete saved entry for every cataloged kind; adding a kind without one fails to compile. */
const EXAMPLES: Record<AuditKindName, Omit<SavedAuditEntry, 'action'>> = {
	'availability.created': {
		recordLabel: 'Leave',
		subjectLabel: 'SPC Doe, Jane',
		details: { startDate: '2026-11-10', endDate: '2026-11-20' }
	},
	'availability.updated': {
		recordLabel: 'Leave',
		subjectLabel: 'SPC Doe, Jane',
		details: {
			startDate: '2026-11-12',
			endDate: '2026-11-20',
			change: { startDate: { from: '2026-11-10', to: '2026-11-12' } }
		}
	},
	'availability.deleted': {
		recordLabel: 'Leave',
		subjectLabel: 'SPC Doe, Jane',
		details: { startDate: '2026-11-10', endDate: '2026-11-20' }
	}
};

function read(action: AuditKindName, entry: Partial<SavedAuditEntry> = {}) {
	return catalogSentence({ action, ...EXAMPLES[action], ...entry }, context);
}

describe('audit kind catalog', () => {
	it('reads every cataloged kind from its saved labels', () => {
		for (const action of Object.keys(AUDIT_KINDS) as AuditKindName[]) {
			expect(read(action), action).toMatch(/\S/);
		}
	});

	it('reads nothing when a saved entry lacks a label or detail its kind requires', () => {
		for (const action of Object.keys(AUDIT_KINDS) as AuditKindName[]) {
			const { details } = EXAMPLES[action];
			expect(read(action, { recordLabel: null }), `${action} record`).toBeNull();
			expect(read(action, { subjectLabel: '  ' }), `${action} subject`).toBeNull();
			for (const key of Object.keys(details ?? {})) {
				const { [key]: _removed, ...rest } = details ?? {};
				expect(read(action, { details: rest }), `${action} ${key}`).toBeNull();
			}
		}
	});

	it('says who an availability entry was for, its status and its dates', () => {
		expect(read('availability.created')).toBe('Added Leave for SPC Doe, Jane from 10 Nov to 20 Nov');
		expect(read('availability.deleted')).toBe('Deleted Leave for SPC Doe, Jane from 10 Nov to 20 Nov');
		expect(read('availability.created', { details: { startDate: '2027-01-04', endDate: '2027-01-04' } })).toBe(
			'Added Leave for SPC Doe, Jane on 4 Jan 2027'
		);
	});

	it('shows the dates of a changed availability entry before and after', () => {
		expect(read('availability.updated')).toBe('Changed Leave for SPC Doe, Jane from 10–20 Nov to 12–20 Nov');
		expect(
			read('availability.updated', {
				details: {
					startDate: '2026-11-28',
					endDate: '2026-12-03',
					change: { endDate: { from: '2026-11-30', to: '2026-12-03' } }
				}
			})
		).toBe('Changed Leave for SPC Doe, Jane from 28–30 Nov to 28 Nov–3 Dec');
	});

	it('names the earlier status and person of a moved entry and only notes a changed note', () => {
		expect(
			read('availability.updated', {
				details: {
					startDate: '2026-11-10',
					endDate: '2026-11-20',
					change: {
						status: { from: 'TDY', to: 'Leave' },
						person: { from: 'PFC Roe, Rich', to: 'SPC Doe, Jane' },
						note: { withheld: true }
					}
				}
			})
		).toBe('Changed TDY to Leave for SPC Doe, Jane (moved from PFC Roe, Rich) on 10–20 Nov, and its note');
		expect(
			read('availability.updated', {
				details: { startDate: '2026-11-10', endDate: '2026-11-20', change: { note: { withheld: true } } }
			})
		).toBe('Changed the note on Leave for SPC Doe, Jane on 10–20 Nov');
	});

	it('reads nothing for an update that saved no change', () => {
		expect(
			read('availability.updated', { details: { startDate: '2026-11-10', endDate: '2026-11-20', change: {} } })
		).toBeNull();
	});

	it('leaves an uncataloged action to its legacy sentence', () => {
		expect(catalogSentence({ action: 'availability.bulk_created', ...EXAMPLES['availability.created'] }, context)).toBe(
			null
		);
	});
});

describe('batchSentence', () => {
	it('counts each kind one action wrote, in the order it first appears', () => {
		expect(
			batchSentence(['availability.created', 'availability.deleted', 'availability.created', 'availability.created'])
		).toBe('Added 3 availability entries, deleted 1 availability entry');
	});

	it('counts as a floor when older entries of the action were not loaded', () => {
		expect(batchSentence(['availability.deleted', 'availability.deleted'], { partial: true })).toBe(
			'Deleted at least 2 availability entries'
		);
	});
});
