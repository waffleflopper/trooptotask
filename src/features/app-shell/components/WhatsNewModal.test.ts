// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import WhatsNewModal from './WhatsNewModal.svelte';

const entries = [
	{
		id: 'newest',
		title: 'Newest update',
		paragraphs: ['First paragraph', 'Second paragraph'],
		publishedOn: '2026-10-24'
	},
	{ id: 'older', title: 'Older update', paragraphs: ['Older paragraph'], publishedOn: '2026-10-20' }
];

afterEach(cleanup);

describe('WhatsNewModal', () => {
	it('shows the newest entry in full and the others under Earlier updates', () => {
		render(WhatsNewModal, { entries, allEntriesHref: '/org/alpha/whats-new', onClose: vi.fn() });
		const dialog = screen.getByRole('dialog');
		expect(within(dialog).getByRole('heading', { name: 'Newest update' })).toBeTruthy();
		expect(within(dialog).getByText('Second paragraph')).toBeTruthy();
		const earlier = within(dialog).getByRole('region', { name: 'Earlier updates' });
		expect(within(earlier).getByRole('heading', { name: 'Older update' })).toBeTruthy();
	});

	it('links to every update and closes when that link is followed', async () => {
		const onClose = vi.fn();
		render(WhatsNewModal, { entries, allEntriesHref: '/org/alpha/whats-new', onClose });
		const link = screen.getByRole('link', { name: 'See all updates' });
		expect(link.getAttribute('href')).toBe('/org/alpha/whats-new');
		await fireEvent.click(link);
		expect(onClose).toHaveBeenCalled();
	});

	it('still offers the all-updates link when nothing is published', () => {
		render(WhatsNewModal, { entries: [], allEntriesHref: '/org/alpha/whats-new', onClose: vi.fn() });
		expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
		expect(screen.getByRole('link', { name: 'See all updates' })).toBeTruthy();
	});

	it('closes from Got it', async () => {
		const onClose = vi.fn();
		render(WhatsNewModal, { entries, allEntriesHref: '/org/alpha/whats-new', onClose });
		await fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
		expect(onClose).toHaveBeenCalledOnce();
	});
});
