import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '$lib/audit/contracts';
import type { WhatsNewEntry } from '../whatsNewTypes';
import { createPlatformWhatsNew, markShownToUsers, validateWhatsNewDraft, type WhatsNewStore } from './whatsNew.server';

const NOW = new Date('2026-10-24T15:00:00Z');

function entry(id: string, publishedOn: string | null, overrides: Partial<WhatsNewEntry> = {}): WhatsNewEntry {
	return {
		id,
		title: id,
		paragraphs: ['Body'],
		publishedOn,
		updatedBy: null,
		updatedAt: '2026-10-01T00:00:00Z',
		...overrides
	};
}

const newId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function memoryStore(initial: WhatsNewEntry[] = []) {
	const rows = [...initial];
	let counter = 0;
	const store: WhatsNewStore = {
		listEntries: async () => [...rows],
		getEntry: async (id) => rows.find((row) => row.id === id) ?? null,
		createEntry: async (input) => {
			const created = entry(newId(++counter), input.publishedOn, {
				title: input.title,
				paragraphs: input.paragraphs,
				updatedBy: input.updatedBy
			});
			rows.unshift(created);
			return created;
		},
		updateEntry: async (input) => {
			const row = rows.find((candidate) => candidate.id === input.id);
			if (!row) return false;
			Object.assign(row, {
				title: input.title,
				paragraphs: input.paragraphs,
				updatedBy: input.updatedBy,
				...(input.publishedOn ? { publishedOn: input.publishedOn } : {})
			});
			return true;
		},
		deleteDraft: async (id) => {
			const index = rows.findIndex((row) => row.id === id && row.publishedOn === null);
			if (index >= 0) rows.splice(index, 1);
		}
	};
	return { store, rows };
}

function setup(initial: WhatsNewEntry[] = []) {
	const { store, rows } = memoryStore(initial);
	const audits: AuditEvent[] = [];
	const audit = vi.fn(async (event: AuditEvent) => {
		audits.push(event);
	});
	const operations = createPlatformWhatsNew({ store, actorUserId: 'operator-1', audit, now: () => NOW });
	return { operations, rows, audits, audit };
}

describe('validateWhatsNewDraft', () => {
	it('trims the title and drops blank paragraphs', () => {
		expect(validateWhatsNewDraft({ title: '  Hello ', paragraphs: [' One ', '  ', 'Two'] }, NOW)).toEqual({
			valid: true,
			title: 'Hello',
			paragraphs: ['One', 'Two']
		});
	});

	it('lets a draft be empty but not a publish', () => {
		expect(validateWhatsNewDraft({ title: 'Hello', paragraphs: [] }, NOW).valid).toBe(true);
		expect(validateWhatsNewDraft({ title: 'Hello', paragraphs: [' '], publishOn: '2026-10-24' }, NOW)).toEqual({
			valid: false,
			error: 'Add a paragraph before publishing'
		});
	});

	it.each([
		['a missing title', { title: ' ', paragraphs: ['x'] }],
		['a long title', { title: 'x'.repeat(201), paragraphs: ['x'] }],
		['too many paragraphs', { title: 'x', paragraphs: Array.from({ length: 31 }, () => 'x') }],
		['a long paragraph', { title: 'x', paragraphs: ['x'.repeat(1501)] }]
	])('rejects %s', (_name, input) => {
		expect(validateWhatsNewDraft(input, NOW).valid).toBe(false);
	});

	it.each([
		['today', '2026-10-24', true],
		['yesterday in a western time zone', '2026-10-23', true],
		['tomorrow in an eastern time zone', '2026-10-25', true],
		['two days ahead', '2026-10-26', false],
		['last month', '2026-09-24', false],
		['an impossible date', '2026-02-31', false],
		['free text', 'today', false]
	])('accepts a publish date of %s only within a day of the server date', (_name, publishOn, valid) => {
		expect(validateWhatsNewDraft({ title: 'x', paragraphs: ['x'], publishOn }, NOW).valid).toBe(valid);
	});
});

describe('markShownToUsers', () => {
	it('marks the newest three published entries and never a draft', () => {
		const marked = markShownToUsers([
			entry('draft', null),
			entry('a', '2026-10-24'),
			entry('b', '2026-10-23'),
			entry('c', '2026-10-22'),
			entry('d', '2026-10-21')
		]);
		expect(marked.map((row) => [row.id, row.shownToUsers])).toEqual([
			['draft', false],
			['a', true],
			['b', true],
			['c', true],
			['d', false]
		]);
	});
});

describe("platform What's New", () => {
	it('saves a draft with the actor attributed and audits it', async () => {
		const { operations, rows, audits } = setup();
		const result = await operations.save({ id: null, title: 'Roster update', paragraphs: ['Body'] });
		expect(result).toEqual({ status: 'saved', id: newId(1), published: false });
		expect(rows[0]).toMatchObject({ publishedOn: null, updatedBy: 'operator-1' });
		expect(audits).toEqual([
			expect.objectContaining({ action: 'whats_new_create', resourceType: 'whats_new_entry', resourceId: newId(1) })
		]);
	});

	it('publishes a draft once and audits the publish', async () => {
		const { operations, rows, audits } = setup([entry('draft', null)]);
		const result = await operations.save({
			id: 'draft',
			title: 'Roster',
			paragraphs: ['Body'],
			publishOn: '2026-10-24'
		});
		expect(result).toEqual({ status: 'saved', id: 'draft', published: true });
		expect(rows[0].publishedOn).toBe('2026-10-24');
		expect(audits.map((event) => event.action)).toEqual(['whats_new_publish']);
	});

	it('keeps the original publish date when a published entry is edited', async () => {
		const { operations, rows, audits } = setup([entry('live', '2026-10-01')]);
		await operations.save({ id: 'live', title: 'Edited', paragraphs: ['Body'], publishOn: '2026-10-24' });
		expect(rows[0]).toMatchObject({ title: 'Edited', publishedOn: '2026-10-01' });
		expect(audits.map((event) => event.action)).toEqual(['whats_new_update']);
	});

	it('audits an imported entry with a text id without a resource id, so the audit write still lands', async () => {
		const { operations, audits } = setup([entry('2026-10-24-personnel-roster', '2026-10-24')]);
		await operations.save({ id: '2026-10-24-personnel-roster', title: 'Edited', paragraphs: ['Body'] });
		expect(audits).toEqual([
			expect.objectContaining({
				action: 'whats_new_update',
				resourceId: undefined,
				details: { title: 'Edited', entryId: '2026-10-24-personnel-roster' }
			})
		]);
	});

	it('refuses to empty a published entry', async () => {
		const { operations, rows, audit } = setup([entry('live', '2026-10-01')]);
		expect(await operations.save({ id: 'live', title: 'Edited', paragraphs: ['  '] })).toEqual({
			status: 'invalid',
			error: 'A published entry needs a paragraph'
		});
		expect(rows[0]).toMatchObject({ title: 'live', paragraphs: ['Body'] });
		expect(audit).not.toHaveBeenCalled();
	});

	it('writes nothing and audits nothing for an invalid entry', async () => {
		const { operations, rows, audit } = setup();
		expect(await operations.save({ id: null, title: '', paragraphs: [] })).toEqual({
			status: 'invalid',
			error: 'Title is required'
		});
		expect(rows).toEqual([]);
		expect(audit).not.toHaveBeenCalled();
	});

	it('reports an entry that no longer exists', async () => {
		const { operations, audit } = setup();
		expect(await operations.save({ id: 'gone', title: 'x', paragraphs: ['x'] })).toEqual({ status: 'not_found' });
		expect(await operations.deleteDraft('gone')).toEqual({ status: 'not_found' });
		expect(audit).not.toHaveBeenCalled();
	});

	it('deletes a draft but refuses a published entry', async () => {
		const { operations, rows, audits } = setup([entry('draft', null), entry('live', '2026-10-01')]);
		expect(await operations.deleteDraft('live')).toEqual({ status: 'published' });
		expect(rows.map((row) => row.id)).toEqual(['draft', 'live']);
		expect(await operations.deleteDraft('draft')).toEqual({ status: 'deleted' });
		expect(rows.map((row) => row.id)).toEqual(['live']);
		expect(audits.map((event) => event.action)).toEqual(['whats_new_delete']);
	});

	it('does not report success when the audit fails', async () => {
		const { store } = memoryStore();
		const operations = createPlatformWhatsNew({
			store,
			actorUserId: 'operator-1',
			audit: async () => {
				throw new Error('audit unavailable');
			},
			now: () => NOW
		});
		await expect(operations.save({ id: null, title: 'x', paragraphs: ['x'] })).rejects.toThrow('audit unavailable');
	});

	it('lists with the users-see-this mark', async () => {
		const { operations } = setup([entry('live', '2026-10-01'), entry('draft', null)]);
		expect(await operations.list()).toEqual([
			expect.objectContaining({ id: 'live', shownToUsers: true }),
			expect.objectContaining({ id: 'draft', shownToUsers: false })
		]);
	});
});
