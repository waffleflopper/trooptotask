import { describe, expect, it } from 'vitest';
import { feedbackTitle, inboxHref, parseInboxFilter, parseInboxItemKey, parseInboxTab } from './inboxTypes';

const ID = '11111111-1111-4111-8111-111111111111';

describe('Inbox URL state', () => {
	it('round-trips tab, filter and item through the address', () => {
		const item = { kind: 'accessRequest', id: ID } as const;
		const href = inboxHref({ tab: 'done', filter: 'accessRequest', item });
		const params = new URL(href, 'https://app.example.test').searchParams;

		expect(href).toBe(`/admin?tab=done&kind=accessRequest&item=accessRequest%3A${ID}`);
		expect(parseInboxTab(params.get('tab'))).toBe('done');
		expect(parseInboxFilter(params.get('kind'))).toBe('accessRequest');
		expect(parseInboxItemKey(params.get('item'))).toEqual(item);
	});

	it('leaves the default view as the bare Inbox address', () => {
		expect(inboxHref({ tab: 'open', filter: 'all', item: null })).toBe('/admin');
	});

	it.each([null, '', 'feedback', 'feedback:', `nothing:${ID}`, 'feedback:123'])('ignores the item %j', (value) => {
		expect(parseInboxItemKey(value)).toBeNull();
	});

	it('falls back to Open and All for values it does not know', () => {
		expect(parseInboxTab('archive')).toBe('open');
		expect(parseInboxFilter('everything')).toBe('all');
	});
});

describe('feedbackTitle', () => {
	it('stands the first sentence of the first line in for a title', () => {
		expect(feedbackTitle("Leave won't save. It closes the dialog.\nSecond line")).toBe("Leave won't save.");
		expect(feedbackTitle('Version 2.5 is slow\nmore')).toBe('Version 2.5 is slow');
	});

	it('shortens a long sentence with an ellipsis', () => {
		const title = feedbackTitle('word '.repeat(40));
		expect(title.endsWith('…')).toBe(true);
		expect(title.length).toBeLessThanOrEqual(91);
	});
});
