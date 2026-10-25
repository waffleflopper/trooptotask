// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

const { invalidateAll } = vi.hoisted(() => ({ invalidateAll: vi.fn() }));
vi.mock('$app/navigation', () => ({ invalidateAll }));

import Page from './+page.svelte';

const entry = { id: 'a', title: 'Roster update', paragraphs: ['One', 'Two'], publishedOn: '2026-10-24' };
const props = (entries: Promise<unknown>) => ({ data: { entries } }) as never;

afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});

describe('What’s new page', () => {
	it('shows a skeleton while the entries load, then every entry', async () => {
		let release!: (value: unknown) => void;
		render(Page, props(new Promise((resolve) => (release = resolve))));
		expect(screen.getByRole('status', { name: 'Loading updates' })).toBeTruthy();
		release({ status: 'loaded', entries: [entry] });
		expect(await screen.findByText('Roster update')).toBeTruthy();
		expect(screen.getByText('Two')).toBeTruthy();
		expect(screen.queryByRole('status', { name: 'Loading updates' })).toBeNull();
	});

	it('says so when nothing is published', async () => {
		render(Page, props(Promise.resolve({ status: 'loaded', entries: [] })));
		expect(await screen.findByText('Nothing new yet.')).toBeTruthy();
	});

	it('shows the load error with a retry that re-reads', async () => {
		invalidateAll.mockResolvedValue(undefined);
		render(Page, props(Promise.resolve({ status: 'failed' })));
		await fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
		await waitFor(() => expect(invalidateAll).toHaveBeenCalledOnce());
	});

	it('shows the same load error when the streamed read itself is rejected', async () => {
		const rejected = Promise.reject(new Error('stream failed'));
		rejected.catch(() => {});
		render(Page, props(rejected));
		expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
		expect(screen.getByText('Updates could not be loaded')).toBeTruthy();
	});
});
