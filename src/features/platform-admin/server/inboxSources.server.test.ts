import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import type { AccessRequestInboxRow, IdentityAccessRequestInboxReader } from '$features/identity/index.server';
import type { FeedbackInboxReader, FeedbackInboxRow } from '$features/feedback/index.server';
import {
	createAccessRequestInboxSource,
	createFeedbackInboxSource,
	readInboxSource,
	readInboxSources,
	type InboxSources
} from './inboxSources.server';

const NOW = new Date('2026-10-30T12:00:00Z');

const request: AccessRequestInboxRow = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Sam Rivera',
	email: 'sam@example.test',
	reason: '1SG, B Co',
	heard_about: null,
	heard_about_details: null,
	status: 'pending',
	created_at: '2026-10-29T08:00:00Z',
	reviewed_at: null
};
const feedback: FeedbackInboxRow = {
	id: '22222222-2222-4222-8222-222222222222',
	user_email: 'member@example.test',
	category: 'bug',
	message: 'The roster will not load\nSecond line with detail',
	page_url: '/org/alpha/personnel',
	page_section: null,
	organization_name: 'Alpha',
	status: 'resolved',
	created_at: '2026-10-20T08:00:00Z',
	updated_at: '2026-10-28T09:00:00Z'
};

function accessRequestReader(overrides: Partial<IdentityAccessRequestInboxReader> = {}) {
	return {
		readOpen: vi.fn(async () => ({ rows: [request], count: 1 })),
		readClosed: vi.fn(async () => ({ rows: [], count: 0 })),
		get: vi.fn(async () => request),
		accountExists: vi.fn(async () => false),
		...overrides
	} satisfies IdentityAccessRequestInboxReader;
}

function feedbackReader(overrides: Partial<FeedbackInboxReader> = {}) {
	return {
		readOpen: vi.fn(async () => ({ rows: [], count: 0 })),
		readClosed: vi.fn(async () => ({ rows: [feedback], count: 1 })),
		get: vi.fn(async () => feedback),
		close: vi.fn(async () => true),
		...overrides
	} satisfies FeedbackInboxReader;
}

const noOrganizations = {
	from: () => ({
		select: () => ({ ilike: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) })
	})
} as unknown as SupabaseClient;

describe('Inbox sources', () => {
	it('reports a failed source as its own error, never as an empty list', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const sources: InboxSources = {
			accessRequest: createAccessRequestInboxSource(
				accessRequestReader({
					readOpen: async () => {
						throw new Error('database unavailable');
					}
				}),
				noOrganizations
			),
			feedback: createFeedbackInboxSource(feedbackReader({ readOpen: async () => ({ rows: [], count: 0 }) }))
		};

		const results = readInboxSources(sources, 'open');

		await expect(results.accessRequest).resolves.toEqual({ status: 'error' });
		await expect(results.feedback).resolves.toEqual({ status: 'ok', count: 0, items: [] });
	});

	it('limits Done to the last 30 days', async () => {
		const readClosed = vi.fn(async () => ({ rows: [feedback], count: 1 }));
		const source = createFeedbackInboxSource(feedbackReader({ readClosed }), () => NOW);

		await readInboxSource(source, 'done');

		expect(readClosed).toHaveBeenCalledWith(expect.objectContaining({ since: new Date('2026-09-30T12:00:00Z') }));
	});

	it('titles feedback by the first line of its message and dates closure from its last update', async () => {
		const source = createFeedbackInboxSource(feedbackReader(), () => NOW);

		const result = await readInboxSource(source, 'done');

		expect(result).toEqual({
			status: 'ok',
			count: 1,
			items: [
				{
					kind: 'feedback',
					id: feedback.id,
					title: 'The roster will not load',
					summary: 'member@example.test',
					receivedAt: '2026-10-20T08:00:00Z',
					closedAt: '2026-10-28T09:00:00Z',
					category: 'bug'
				}
			]
		});
	});

	it('shows an approved request as closed with its outcome and a pending one as open', async () => {
		const approved: AccessRequestInboxRow = { ...request, status: 'approved', reviewed_at: '2026-10-30T09:00:00Z' };
		const source = createAccessRequestInboxSource(
			accessRequestReader({
				readOpen: async () => ({ rows: [request], count: 1 }),
				readClosed: async () => ({ rows: [approved], count: 1 })
			}),
			noOrganizations,
			() => NOW
		);

		const open = await readInboxSource(source, 'open');
		const done = await readInboxSource(source, 'done');

		expect(open.status === 'ok' && open.items[0]).toMatchObject({ closedAt: null, outcome: null });
		expect(done.status === 'ok' && done.items[0]).toMatchObject({
			closedAt: '2026-10-30T09:00:00Z',
			outcome: 'approved'
		});
	});

	it('returns no detail for an item that is gone', async () => {
		const source = createFeedbackInboxSource(feedbackReader({ get: async () => null }));

		await expect(source.detail(feedback.id)).resolves.toBeNull();
	});
});
