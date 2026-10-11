// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnnouncementBanner from './AnnouncementBanner.svelte';
import { toastStore } from '$lib/stores/toast.svelte';

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
	const error = vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(held.pending));
	const view = render(AnnouncementBanner, { accountId: 'account-a', announcements: [announcement] });
	await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
	expect(screen.getByRole('button', { name: 'Dismiss announcement' }).getAttribute('aria-disabled')).toBe('true');
	await view.rerender({ accountId: 'account-b', announcements: [announcement] });
	held.release(new Response(null, { status }));
	await held.pending;
	await waitFor(() =>
		expect(screen.getByRole('button', { name: 'Dismiss announcement' }).getAttribute('aria-disabled')).toBeNull()
	);
	expect(screen.getByText('Heads up')).toBeTruthy();
	expect(error).not.toHaveBeenCalled();
});

it('preserves account-wide dismissal across an Organization presentation refresh', async () => {
	const held = heldResponse();
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(held.pending));
	const view = render(AnnouncementBanner, { accountId: 'account-a', announcements: [announcement] });
	await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
	await view.rerender({ accountId: 'account-a', announcements: [{ ...announcement }] });
	held.release(new Response(null, { status: 200 }));
	await waitFor(() => expect(screen.queryByText('Heads up')).toBeNull());
});

it('does not report a late failure after the banner is unmounted', async () => {
	const held = heldResponse();
	const error = vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
	vi.stubGlobal('fetch', vi.fn().mockReturnValue(held.pending));
	const view = render(AnnouncementBanner, { accountId: 'account-a', announcements: [announcement] });
	await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
	view.unmount();
	held.release(new Response(null, { status: 503 }));
	await held.pending;
	await Promise.resolve();
	expect(error).not.toHaveBeenCalled();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

it('retains a failed dismissal, reports failure and permits a successful retry', async () => {
	const error = vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(new Response(null, { status: 503 }))
		.mockResolvedValueOnce(new Response(null, { status: 200 }));
	vi.stubGlobal('fetch', fetchMock);
	render(AnnouncementBanner, {
		accountId: 'account-a',
		announcements: [{ id: 'announcement-1', title: 'Heads up', message: 'Maintenance tonight', type: 'maintenance' }]
	});
	await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
	await waitFor(() => expect(error).toHaveBeenCalled());
	expect(screen.getByText('Heads up')).toBeTruthy();
	expect(screen.getByRole('button', { name: 'Dismiss announcement' }).getAttribute('aria-disabled')).toBeNull();
	await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));
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

		await fireEvent.click(screen.getByRole('button', { name: 'Dismiss announcement' }));

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

		const [first, second] = screen.getAllByRole('button', { name: 'Dismiss announcement' });
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
		const button = screen.getByRole('button', { name: 'Dismiss announcement' }) as HTMLButtonElement;
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
