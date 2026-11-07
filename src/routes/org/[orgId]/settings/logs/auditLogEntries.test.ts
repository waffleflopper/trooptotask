import { describe, expect, it } from 'vitest';
import type { AuditLogEntry } from '$lib/audit/contracts';
import {
	auditDayHead,
	auditKindOptions,
	auditLines,
	auditScope,
	auditSentence,
	viewAuditEntry
} from './auditLogEntries';

describe('auditScope', () => {
	it.each([
		['deletion_request.created', 'deletions'],
		['deletion_request.approved', 'deletions'],
		['training_record.deleted', 'deletions'],
		['availability.bulk_deleted', 'deletions'],
		['personnel.counseling_record.archived', 'deletions'],
		['personnel.permanently_deleted', 'deletions'],
		['org.deleted', 'deletions'],
		['organization.rank_catalog.deleted', 'deletions'],
		['member.removed', 'access'],
		['member.invite_revoked', 'access'],
		['organization_invitation.declined', 'access'],
		['access_request.rejected', 'access'],
		['org.renamed', 'access'],
		['organization.settings_updated', 'access'],
		['organization.rank_catalog.retired', 'access'],
		['policy.denied', 'access'],
		['personnel.restored', 'records'],
		['notification.delete_all', 'records'],
		['announcement_delete', 'records'],
		['export.created', 'records'],
		['training_record.updated', 'records']
	] as const)('files %s under %s', (action, scope) => expect(auditScope(action)).toBe(scope));

	it('files an action no producer writes yet by its event, then its family', () => {
		expect(auditScope('widget.purged')).toBe('deletions');
		expect(auditScope('organization.widget_added')).toBe('access');
		expect(auditScope('widget.frobbed')).toBe('records');
	});
});

describe('auditSentence', () => {
	it('reports added, updated and failed import rows and retains legacy merge counts', () => {
		expect(auditSentence('personnel.bulk_merged', { created: 40, updated: 0, errors: 2 })).toBe(
			'Imported personnel (40 added, 0 updated, 2 failed)'
		);
		expect(auditSentence('personnel.bulk_merged', { created: 3, updated: 8, errors: 0 })).toBe(
			'Imported personnel (3 added, 8 updated, 0 failed)'
		);
		expect(auditSentence('personnel.bulk_merged', { updated: 8, skipped: 2 })).toBe(
			'Imported personnel (8 updated, 2 skipped)'
		);
	});

	it.each(['started', 'blocked', 'unblocked', 'completed', 'reopened', 'cancelled'])(
		'names the tasking a %s move changed, under Calendar',
		(verb) => {
			const action = `calendar_tasking.${verb}`;
			const sentence = auditSentence(action, { title: 'Provide medics' });

			expect(sentence).toContain('Provide medics');
			expect(sentence).not.toContain(action);
			expect(viewAuditEntry(entry({ action, details: null }), 'UTC').area).toBe('Calendar');
		}
	);

	it.each([
		'equipment_added',
		'equipment_changed',
		'equipment_secured',
		'equipment_removed',
		'equipment_reordered',
		'checklist_added',
		'checklist_renamed',
		'checklist_completed',
		'checklist_reopened',
		'checklist_removed',
		'checklist_reordered'
	])('names the item and tasking behind %s, under Calendar', (verb) => {
		const action = `calendar_tasking.${verb}`;
		const sentence = auditSentence(action, { title: 'Provide medics', item: 'Litters' });

		expect(sentence).toContain('Provide medics');
		expect(sentence).not.toContain(action);
		expect(viewAuditEntry(entry({ action, details: null }), 'UTC').area).toBe('Calendar');
	});

	it('falls back to the event in words for an action it does not know', () => {
		const sentence = auditSentence('widget.frobbed', null);

		expect(sentence).toContain('frobbed');
		expect(sentence).not.toContain('widget.frobbed');
	});

	it('names the feature switches turned off and on', () => {
		const switched = (previous: string[], next: string[]) =>
			auditSentence('organization.settings_updated', {
				previous_disabled_features: previous,
				disabled_features: next
			});
		const sentence = switched(['training'], ['onboarding', 'lossesAndAwards']);

		expect(sentence).toBe('Turned off Onboarding, Losses and awards; Turned on Training');
	});

	it('shows the strength floor before then after, and policy values as set', () => {
		const floor = auditSentence('organization.settings_updated', {
			previous_strength_floor_percent: 80,
			strength_floor_percent: 75
		});

		expect(floor.indexOf('80%')).toBeGreaterThanOrEqual(0);
		expect(floor.indexOf('80%')).toBeLessThan(floor.indexOf('75%'));
		expect(auditSentence('organization.settings_updated', { loss_warning_window_days: 120 })).toContain('120');
	});

	it('says what a deletion request was about, and archive for a person', () => {
		const record = auditSentence('deletion_request.approved', {
			subject_type: 'training_record',
			subject_label: 'Weapons Qualification'
		});
		const person = auditSentence('deletion_request.approved', {
			subject_type: 'personnel',
			subject_label: 'PFC Grant'
		});

		expect(record).toContain('Weapons Qualification');
		expect(record).toMatch(/delet/i);
		expect(person).toContain('PFC Grant');
		expect(person).toMatch(/archive/i);
		expect(
			auditSentence('deletion_request.denied', { subject_type: 'personnel', subject_label: 'PFC Grant' })
		).not.toBe(person);
	});

	it('uses resolved labels and skips values the audit writer redacted', () => {
		const training = auditSentence('training_record.updated', {
			personnel: 'SPC Reed',
			training_type: 'Weapons Qualification'
		});

		expect(training).toContain('SPC Reed');
		expect(training).toContain('Weapons Qualification');
		expect(auditSentence('member.invite', { email: 'b***@army.mil' })).toContain('b***@army.mil');
		expect(auditSentence('member.invite', { email: '[redacted]' })).not.toContain('redacted');
		expect(auditSentence('personnel.restored', { subject_label: 'SGT Fields' })).toContain('SGT Fields');
		expect(auditSentence('sign_in_roster.created', { title: 'Range day' })).toContain('Range day');
		expect(auditSentence('personnel.bulk_archived', { count: 3 })).toContain('3');
	});
});

function entry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
	return {
		id: 'audit-1',
		userId: null,
		actor: null,
		action: 'org.renamed',
		resourceType: 'organization',
		resourceId: null,
		details: { name: 'C Co' },
		recordLabel: null,
		subject: null,
		batchId: null,
		createdAt: '2026-10-20T03:30:00Z',
		...overrides
	};
}

describe('viewAuditEntry', () => {
	it("puts the clock and the day in the viewer's time zone", () => {
		expect(viewAuditEntry(entry({}), 'America/New_York')).toMatchObject({ day: '2026-10-19', clock: '23:30' });
		expect(viewAuditEntry(entry({}), 'UTC')).toMatchObject({ day: '2026-10-20', clock: '03:30' });
		expect(viewAuditEntry(entry({ createdAt: '2026-10-20T00:00:00+00:00' }), 'UTC')).toMatchObject({
			day: '2026-10-20',
			clock: '00:00'
		});
	});

	it.each([
		['no actor', { userId: null, actor: '  ' }, { actor: 'System', system: true }],
		['a member it cannot name', { userId: 'user-1', actor: null }, { actor: 'Unknown member', system: false }],
		['a named member', { userId: 'user-1', actor: 'dana@army.mil' }, { actor: 'dana@army.mil', system: false }],
		['a saved actor with no user', { userId: null, actor: 'cleanup job' }, { actor: 'cleanup job', system: false }]
	] as const)('attributes an entry by %s', (_case, who, expected) => {
		expect(viewAuditEntry(entry(who), 'UTC')).toMatchObject(expected);
	});

	it('reads the event of an entry', () => {
		expect(viewAuditEntry(entry({ actor: 'dana@army.mil' }), 'UTC')).toMatchObject({
			area: 'Unit',
			scope: 'access',
			sentence: 'Renamed the unit to C Co'
		});
	});

	it('reads a cataloged entry from its saved labels, and an entry saved before them as it always read', () => {
		const sentence = (overrides: Partial<AuditLogEntry>) =>
			viewAuditEntry(entry({ action: 'availability.created', ...overrides }), 'UTC').sentence;
		expect(
			sentence({
				recordLabel: 'Leave',
				subject: { personnelId: null, label: 'SPC Doe, Jane' },
				details: { startDate: '2026-11-10', endDate: '2026-11-20' }
			})
		).toBe('Added Leave for SPC Doe, Jane from 10 Nov to 20 Nov');
		expect(sentence({ details: { personnel: 'SPC Doe Jane' } })).toBe('Added availability entry SPC Doe Jane');
		expect(sentence({ details: null })).toBe('Added an availability entry');
	});

	it('names the product area of an action', () => {
		const area = (action: string) => viewAuditEntry(entry({ action, details: null }), 'UTC').area;
		expect(area('organization.settings_updated')).toBe('Policies');
		expect(area('organization.rank_catalog.saved')).toBe('Ranks');
		expect(area('deletion_request.approved')).toBe('Approvals');
		expect(area('member.access_changed')).toBe('Members');
		expect(area('personnel.permanently_deleted')).toBe('Archives');
		expect(area('training_record.updated')).toBe('Training');
		expect(area('daily_assignment.replaced')).toBe('Calendar');
		expect(area('widget_part.frobbed')).toBe('Widget part');
	});
});

describe('auditLines', () => {
	const view = (id: string, batchId: string | null, createdAt: string, action = 'availability.created') =>
		viewAuditEntry(entry({ id, batchId, createdAt, action }), 'UTC');

	it('keeps an entry alone unless another entry shares its batch', () => {
		const lines = auditLines([view('a', 'one', '2026-10-20T10:00:00Z'), view('b', null, '2026-10-20T09:00:00Z')]);
		expect(lines.map((line) => [line.id, line.batch.length])).toEqual([
			['a', 0],
			['b', 0]
		]);
	});

	it('puts a batch where its newest entry was and counts a batch cut off by the loaded window as a floor', () => {
		const entries = [
			view('c', 'one', '2026-10-20T10:00:01Z', 'availability.deleted'),
			view('a', 'one', '2026-10-20T10:00:00Z'),
			view('b', null, '2026-10-20T09:00:00Z')
		];
		const [batch, alone] = auditLines(entries);
		expect(batch).toMatchObject({
			id: 'batch-one',
			sentence: 'Deleted 1 availability entry, added 1 availability entry'
		});
		expect(batch.batch.map((item) => item.id)).toEqual(['c', 'a']);
		expect(alone.id).toBe('b');
		expect(auditLines(entries, 'one')[0].sentence).toBe(
			'Deleted at least 1 availability entry, added at least 1 availability entry'
		);
	});
});

describe('a change saved under two people', () => {
	it('shows once in an unfiltered log and under the previous person when filtered to them', () => {
		const move = (id: string, personnelId: string, label: string) =>
			viewAuditEntry(
				entry({
					id,
					action: 'personnel_ict_completion.updated',
					resourceType: 'personnel_ict_completion',
					resourceId: 'completion-1',
					batchId: 'request-1',
					createdAt: '2026-10-20T10:00:00Z',
					recordLabel: 'Apply a tourniquet',
					subject: { personnelId, label },
					details: {
						completedAt: '2030-03-01',
						validationMethod: 'Demonstration',
						change: { person: { from: 'SPC Doe, Jane', to: 'PFC Roe, Rich' } }
					}
				}),
				'UTC'
			);
		const toRoe = move('b', 'roe', 'PFC Roe, Rich');
		const fromDoe = move('a', 'doe', 'SPC Doe, Jane');

		const unfiltered = auditLines([toRoe, fromDoe]);
		expect(unfiltered.map((line) => [line.id, line.batch.length])).toEqual([['b', 0]]);
		const filtered = auditLines([fromDoe]);
		expect(filtered.map((line) => [line.id, line.batch.length])).toEqual([['a', 0]]);
		expect(filtered[0].sentence).toContain('SPC Doe, Jane');
		expect(filtered[0].sentence).toContain('PFC Roe, Rich');
	});

	it('keeps two updates of one completion that one import saved at the same instant', () => {
		const update = (id: string, validationMethod: string) =>
			viewAuditEntry(
				entry({
					id,
					action: 'personnel_ict_completion.updated',
					resourceType: 'personnel_ict_completion',
					resourceId: 'completion-1',
					batchId: 'request-1',
					createdAt: '2026-10-20T10:00:00Z',
					subject: { personnelId: 'doe', label: 'SPC Doe, Jane' },
					details: {
						completedAt: '2030-03-01',
						validationMethod,
						change: { validationMethod: { from: 'Other', to: validationMethod } }
					}
				}),
				'UTC'
			);
		expect(
			auditLines([update('a', 'Demonstration'), update('b', 'Written test')]).map((line) => [
				line.id,
				line.batch.length
			])
		).toEqual([['batch-request-1', 2]]);
	});

	it('keeps every entry of another kind that one action saved against the same record', () => {
		const item = (id: string) =>
			viewAuditEntry(
				entry({
					id,
					action: 'calendar_tasking.checklist_added',
					resourceType: 'calendar_tasking',
					resourceId: 'tasking-1',
					batchId: 'request-1',
					createdAt: '2026-10-20T10:00:00Z'
				}),
				'UTC'
			);
		expect(auditLines([item('a'), item('b')]).map((line) => [line.id, line.batch.length])).toEqual([
			['batch-request-1', 2]
		]);
	});

	it('still folds different records changed by one action', () => {
		const change = (id: string, resourceId: string) =>
			viewAuditEntry(entry({ id, resourceId, batchId: 'request-1', action: 'availability.created' }), 'UTC');
		expect(auditLines([change('a', 'one'), change('b', 'two')]).map((line) => line.sentence)).toEqual([
			'Added 2 availability entries'
		]);
	});
});

describe('auditDayHead', () => {
	it('names today and yesterday with the date, and older days by date', () => {
		expect(auditDayHead('2026-10-19', '2026-10-19', 5)).toEqual({ title: 'Today', detail: '19 Oct · 5 entries' });
		expect(auditDayHead('2026-10-18', '2026-10-19', 1)).toEqual({ title: 'Yesterday', detail: '18 Oct · 1 entry' });
		expect(auditDayHead('2026-10-17', '2026-10-19', 3)).toEqual({ title: '17 Oct', detail: '3 entries' });
	});

	it('counts a day cut off by the loaded window as a floor', () => {
		expect(auditDayHead('2026-10-17', '2026-10-19', 12, { cutOff: true })).toEqual({
			title: '17 Oct',
			detail: '12+ entries'
		});
		expect(auditDayHead('2026-10-19', '2026-10-19', 1, { cutOff: true })).toEqual({
			title: 'Today',
			detail: '19 Oct · 1+ entries'
		});
	});

	it('finds yesterday across a month and a year boundary', () => {
		expect(auditDayHead('2026-10-31', '2026-11-01', 2).title).toBe('Yesterday');
		expect(auditDayHead('2025-12-31', '2026-01-01', 2).title).toBe('Yesterday');
		expect(auditDayHead('2025-12-30', '2026-01-01', 2)).toEqual({ title: '30 Dec 2025', detail: '2 entries' });
	});
});

describe('auditKindOptions', () => {
	it('lists the cataloged kinds and the older actions a unit recorded, once each, grouped by area', () => {
		const options = auditKindOptions(['org.renamed', 'availability.created', 'org.renamed']);

		expect(options.filter((option) => option.value === 'org.renamed')).toEqual([
			{ value: 'org.renamed', label: 'Org renamed', group: 'Unit' }
		]);
		expect(options.filter((option) => option.value === 'availability.created')).toHaveLength(1);
		expect(options.find((option) => option.value === 'availability.created')).toMatchObject({ group: 'Calendar' });
	});

	it('sorts by area, then by name', () => {
		const sorted = auditKindOptions(['training_record.deleted', 'training_record.created']).filter(
			(option) => option.group === 'Training'
		);

		expect(sorted.map((option) => option.label)).toEqual([...sorted.map((option) => option.label)].sort());
	});
});
