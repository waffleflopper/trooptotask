import { describe, expect, it } from 'vitest';
import type { SetupEmailTimeline } from '$features/identity/contracts';
import { accessHistoryEntries, setupTimelineEntries } from './setupTimeline';

const NOW = new Date('2026-10-25T12:00:00Z');

type Link = SetupEmailTimeline[number];
const link = (overrides: Partial<Link> & Pick<Link, 'id' | 'created_at' | 'expires_at'>): Link => ({
	claimed_at: null,
	used_at: null,
	failed_at: null,
	failure_reason: null,
	revoked_at: null,
	revocation_reason: null,
	bounced_at: null,
	bounce_reason: null,
	deliveries: [],
	...overrides
});
const sent = (id: string, at: string): Link['deliveries'][number] => ({
	id,
	status: 'sent',
	attempt_count: 1,
	created_at: at,
	updated_at: at,
	sent_at: at,
	last_error: null
});

describe('setup email timeline', () => {
	it('tells a bounce as sent, then delivery failed with the mail server reason, oldest first', () => {
		const entries = setupTimelineEntries(
			[
				link({
					id: 'l1',
					created_at: '2026-10-21T14:02:00Z',
					expires_at: '2026-11-04T14:02:00Z',
					bounced_at: '2026-10-21T14:03:00Z',
					bounce_reason: 'mailbox not found',
					deliveries: [sent('d1', '2026-10-21T14:02:30Z')]
				})
			],
			NOW,
			'pfc.lin@army.mil'
		);

		expect(entries.map((entry) => [entry.text, entry.tone])).toEqual([
			['Setup link sent.', 'done'],
			['Delivery failed.', 'failed'],
			['Has not finished setup.', 'pending']
		]);
		expect(entries[0].detail).toBe('Delivered to pfc.lin@army.mil');
		expect(entries[1].detail).toBe('The mail server said: mailbox not found');
		expect(entries[2].detail).toBe('The link expires in 10 days. Resending replaces it.');
	});

	it('reports a link that lapsed unclaimed as expired, and shows nothing as waiting', () => {
		const entries = setupTimelineEntries(
			[
				link({
					id: 'l1',
					created_at: '2026-10-01T09:00:00Z',
					expires_at: '2026-10-15T09:00:00Z',
					deliveries: [sent('d1', '2026-10-01T09:00:10Z')]
				})
			],
			NOW
		);

		expect(entries.map((entry) => entry.text)).toEqual(['Setup link sent.', 'The link expired unused.']);
		expect(entries.at(-1)?.at).toBe('2026-10-15T09:00:00Z');
	});

	it('does not call a link that was replaced before it ran out expired, and only the newest can be waiting', () => {
		const entries = setupTimelineEntries(
			[
				link({
					id: 'newer',
					created_at: '2026-10-20T09:00:00Z',
					expires_at: '2026-11-03T09:00:00Z',
					deliveries: [sent('d2', '2026-10-20T09:00:05Z')]
				}),
				link({
					id: 'older',
					created_at: '2026-10-10T09:00:00Z',
					expires_at: '2026-10-24T09:00:00Z',
					revoked_at: '2026-10-20T09:00:00Z',
					revocation_reason: 'replaced',
					deliveries: [sent('d1', '2026-10-10T09:00:05Z')]
				})
			],
			NOW
		);

		expect(entries.map((entry) => entry.text)).toEqual([
			'Setup link sent.',
			'A newer setup link replaced it.',
			'Setup link sent.',
			'Has not finished setup.'
		]);
	});

	it('counts a link retired after it expired as expired unused', () => {
		const entries = setupTimelineEntries(
			[
				link({
					id: 'l1',
					created_at: '2026-10-01T09:00:00Z',
					expires_at: '2026-10-15T09:00:00Z',
					revoked_at: '2026-10-16T00:00:00Z',
					revocation_reason: 'cleanup'
				})
			],
			NOW
		);

		expect(entries.map((entry) => entry.text)).toEqual([
			'Setup link created.',
			'The link expired unused.',
			'The expired link was retired.'
		]);
	});

	it('shows a failed delivery attempt with the provider error', () => {
		const entries = setupTimelineEntries(
			[
				link({
					id: 'l1',
					created_at: '2026-10-24T09:00:00Z',
					expires_at: '2026-11-07T09:00:00Z',
					deliveries: [
						{
							id: 'd1',
							status: 'failed',
							attempt_count: 3,
							created_at: '2026-10-24T09:00:00Z',
							updated_at: '2026-10-24T09:05:00Z',
							sent_at: null,
							last_error: 'provider rejected the request'
						}
					]
				})
			],
			NOW
		);

		expect(entries[0]).toMatchObject({
			text: 'The setup email could not be sent.',
			detail: 'provider rejected the request',
			tone: 'failed'
		});
	});
});

describe('access history', () => {
	it('lists the request, its approval and the setup, oldest first', () => {
		const entries = accessHistoryEntries([
			{
				id: 'r1',
				name: 'Priya',
				email: 'p@army.mil',
				status: 'approved',
				created_at: '2026-08-08T10:00:00Z',
				reviewed_at: '2026-08-08T12:00:00Z',
				setup_completed_at: '2026-08-09T09:00:00Z',
				rescinded_at: null
			}
		]);

		expect(entries.map((entry) => entry.text)).toEqual([
			'Access was requested.',
			'The access request was approved.',
			'Set up the account.'
		]);
	});

	it('words a rejection as rejected, and a pending request has no decision', () => {
		const base = {
			id: 'r',
			name: 'A',
			email: 'a@x.test',
			created_at: '2026-08-08T10:00:00Z',
			setup_completed_at: null,
			rescinded_at: null
		};
		expect(
			accessHistoryEntries([{ ...base, status: 'rejected', reviewed_at: '2026-08-09T10:00:00Z' }]).map((e) => e.text)
		).toContain('The access request was rejected.');
		expect(accessHistoryEntries([{ ...base, status: 'pending', reviewed_at: null }])).toHaveLength(1);
	});
});
