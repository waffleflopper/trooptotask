// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import type { InboxKind, InboxSourceResult } from '../../inboxTypes';
import InboxQueue from './InboxQueue.svelte';

const results: { [K in InboxKind]: InboxSourceResult<K> } = {
	accessRequest: {
		status: 'ok',
		count: 1,
		items: [
			{
				kind: 'accessRequest',
				id: 'access-request',
				title: 'Start an Organization',
				summary: '',
				receivedAt: '2026-10-29T08:00:00Z',
				closedAt: '2026-10-30T10:00:00Z',
				outcome: 'approved'
			}
		]
	},
	feedback: {
		status: 'ok',
		count: 2,
		items: [
			{
				kind: 'feedback',
				id: 'older-replied',
				title: 'Roster issue',
				summary: '',
				category: 'bug',
				receivedAt: '2026-10-20T08:00:00Z',
				lastActivityAt: '2026-10-30T11:00:00Z',
				closedAt: '2026-10-30T11:00:00Z'
			},
			{
				kind: 'feedback',
				id: 'new-submission',
				title: 'Export issue',
				summary: '',
				category: 'bug',
				receivedAt: '2026-10-29T10:00:00Z',
				lastActivityAt: '2026-10-29T10:00:00Z',
				closedAt: '2026-10-29T10:00:00Z'
			}
		]
	},
	setupEmailFailed: {
		status: 'ok',
		count: 1,
		items: [
			{
				kind: 'setupEmailFailed',
				id: 'setup-email',
				linkId: 'setup-email',
				requestId: 'request',
				reason: 'bounced',
				title: 'Setup email failed',
				summary: '',
				failedAt: '2026-10-29T09:00:00Z',
				receivedAt: '2026-10-29T09:00:00Z',
				closedAt: '2026-10-30T11:30:00Z'
			}
		]
	}
};

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('Inbox queue ordering', () => {
	it.each([
		{
			tab: 'open',
			order: [
				'/admin?item=feedback:older-replied',
				'/admin?item=feedback:new-submission',
				'/admin?item=setupEmailFailed:setup-email',
				'/admin?item=accessRequest:access-request'
			]
		},
		{
			tab: 'done',
			order: [
				'/admin?item=setupEmailFailed:setup-email',
				'/admin?item=feedback:older-replied',
				'/admin?item=accessRequest:access-request',
				'/admin?item=feedback:new-submission'
			]
		}
	] as const)('orders $tab by its queue timestamp while preserving the displayed submission age', ({ tab, order }) => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-30T12:00:00Z'));
		render(InboxQueue, {
			props: {
				tab,
				shownKinds: ['accessRequest', 'feedback', 'setupEmailFailed'],
				selected: null,
				results,
				refreshing: false,
				hrefFor: (item) => `/admin?item=${item.kind}:${item.id}`,
				onSelect: () => {},
				onRetry: () => {}
			}
		});

		expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(order);
		if (tab === 'open') {
			expect(screen.getByRole('link', { name: 'Roster issue', description: /10d/ }).getAttribute('href')).toBe(
				'/admin?item=feedback:older-replied'
			);
		}
	});
});
