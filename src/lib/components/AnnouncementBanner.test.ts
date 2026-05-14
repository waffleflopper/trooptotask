// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AnnouncementBanner from './AnnouncementBanner.svelte';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('AnnouncementBanner', () => {
	it('renders announcements with shared alert styling and dismisses through the API', async () => {
		const onCountChange = vi.fn();
		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal('fetch', fetchMock);

		render(AnnouncementBanner, {
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
