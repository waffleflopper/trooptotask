// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnnouncementBanner from './AnnouncementBanner.svelte';

function heldResponse() {
	let release!: (response: Response) => void;
	const pending = new Promise<Response>((resolve) => {
		release = resolve;
	});
	return { pending, release };
}

const announcement = {
	id: 'announcement-1',
	title: 'Heads up',
	message: 'Maintenance tonight',
	type: 'maintenance' as const
};

it.each([200, 503])('ignores a pending account A dismissal after replacement with B (%i)', async (status) => {
	const held = heldResponse();
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(held.pending));
	const view = render(AnnouncementBanner, { accountId: 'account-a', announcements: [announcement] });
	await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Heads up' }));
	expect(screen.getByRole('button', { name: 'Dismiss announcement: Heads up' }).getAttribute('aria-disabled')).toBe(
		'true'
	);
	await view.rerender({ accountId: 'account-b', announcements: [announcement] });
	held.release(new Response(null, { status }));
	await held.pending;
	await waitFor(() =>
		expect(
			screen.getByRole('button', { name: 'Dismiss announcement: Heads up' }).getAttribute('aria-disabled')
		).toBeNull()
	);
	expect(screen.getByText('Heads up')).toBeTruthy();
	expect(screen.getAllByRole('alert')).toHaveLength(1);
});

it('preserves account-wide dismissal across an Organization presentation refresh', async () => {
	const held = heldResponse();
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(held.pending));
	const view = render(AnnouncementBanner, { accountId: 'account-a', announcements: [announcement] });
	await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Heads up' }));
	await view.rerender({ accountId: 'account-a', announcements: [{ ...announcement }] });
	held.release(new Response(null, { status: 200 }));
	await waitFor(() => expect(screen.queryByText('Heads up')).toBeNull());
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('reports a failed dismissal inside its banner, keeps focus on Dismiss and permits a retry', async () => {
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(new Response(null, { status: 503 }))
		.mockResolvedValueOnce(new Response(null, { status: 200 }));
	vi.stubGlobal('fetch', fetchMock);
	render(AnnouncementBanner, {
		accountId: 'account-a',
		announcements: [{ id: 'announcement-1', title: 'Heads up', message: 'Maintenance tonight', type: 'maintenance' }]
	});
	const dismiss = screen.getByRole('button', { name: 'Dismiss announcement: Heads up' });
	dismiss.focus();
	await fireEvent.click(dismiss);
	const banner = screen.getByText('Heads up').closest('[data-slot="alert"]') as HTMLElement;
	const failure = await waitFor(() => within(banner).getByText('Could not dismiss announcement. Try again.'));
	expect(screen.getAllByRole('alert')).toEqual([banner]);
	expect(document.getElementById(dismiss.getAttribute('aria-describedby') ?? '')?.textContent?.trim()).toBe(
		'Could not dismiss announcement. Try again.'
	);
	expect(banner.contains(failure)).toBe(true);
	expect(dismiss.getAttribute('aria-disabled')).toBeNull();
	expect(document.activeElement).toBe(dismiss);
	await fireEvent.click(dismiss);
	await waitFor(() => expect(screen.queryByText('Heads up')).toBeNull());
});

describe('AnnouncementBanner', () => {
	it('renders announcements with shared alert styling and dismisses through the API', async () => {
		const onCountChange = vi.fn();
		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);

		render(AnnouncementBanner, {
			accountId: 'account-a',
			announcements: [{ id: 'announcement-1', title: 'Heads up', message: 'Maintenance tonight', type: 'maintenance' }],
			onCountChange
		});

		const alert = screen.getByRole('alert');
		expect(alert.getAttribute('data-slot')).toBe('alert');
		expect(screen.getByText('Heads up')).toBeTruthy();
		expect(screen.getByText('Maintenance tonight')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement: Heads up' }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith('/api/announcements/dismiss', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ announcementId: 'announcement-1' })
			});
			expect(screen.queryByRole('alert')).toBeNull();
		});
		expect(onCountChange).toHaveBeenCalledWith(0);
	});
});

describe('AnnouncementBanner focus', () => {
	it('moves focus to the next dismissal, then to the main content after the last one', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 204 }))
		);
		const main = document.createElement('main');
		main.id = 'main-content';
		main.tabIndex = -1;
		document.body.append(main);
		render(AnnouncementBanner, {
			accountId: 'account-a',
			announcements: [announcement, { ...announcement, id: 'announcement-2', title: 'Second notice' }]
		});

		const first = screen.getByRole('button', { name: 'Dismiss announcement: Heads up' });
		const second = screen.getByRole('button', { name: 'Dismiss announcement: Second notice' });
		first.focus();
		await fireEvent.click(first);
		await waitFor(() => expect(document.activeElement).toBe(second));
		expect(screen.queryByText('Heads up')).toBeNull();

		await fireEvent.click(second);
		await waitFor(() => expect(document.activeElement).toBe(main));
		expect(screen.queryByRole('alert')).toBeNull();
		main.remove();
	});

	it('keeps focus on a pending dismissal', async () => {
		const held = heldResponse();
		vi.stubGlobal('fetch', vi.fn().mockReturnValue(held.pending));
		render(AnnouncementBanner, { accountId: 'account-a', announcements: [announcement] });
		const button = screen.getByRole('button', { name: 'Dismiss announcement: Heads up' }) as HTMLButtonElement;
		button.focus();
		await fireEvent.click(button);
		expect(button.disabled).toBe(false);
		expect(document.activeElement).toBe(button);
		await fireEvent.click(button);
		expect(fetch).toHaveBeenCalledOnce();
		held.release(new Response(null, { status: 503 }));
		await waitFor(() => expect(button.getAttribute('aria-disabled')).toBeNull());
		expect(document.activeElement).toBe(button);
	});
});
