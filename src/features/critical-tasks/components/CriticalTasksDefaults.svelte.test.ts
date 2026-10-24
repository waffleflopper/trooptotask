// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invalidate } from '$app/navigation';
import CriticalTasksDefaults from './CriticalTasksDefaults.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }));

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

function describedBy(element: HTMLElement): string[] {
	return (element.getAttribute('aria-describedby') ?? '')
		.split(/\s+/)
		.filter(Boolean)
		.map((id) => document.getElementById(id)?.textContent?.trim() ?? `missing #${id}`);
}

const settings = { defaultExpirationMonths: 12, expiringSoonWarningDays: 60 };

describe('Critical Tasks defaults', () => {
	it('discards an unsaved draft when switching Organizations', async () => {
		const view = render(CriticalTasksDefaults, {
			orgId: 'org-a',
			settings: { defaultExpirationMonths: 12, expiringSoonWarningDays: 60 },
			open: true
		});
		const expiration = screen.getByLabelText('Default expiration') as HTMLInputElement;
		await fireEvent.input(expiration, { target: { value: '22' } });
		expect(expiration.value).toBe('22');

		await view.rerender({
			orgId: 'org-b',
			settings: { defaultExpirationMonths: 8, expiringSoonWarningDays: 30 }
		});
		await waitFor(() => {
			expect(expiration.value).toBe('8');
			expect((screen.getByLabelText('Expiring-soon window') as HTMLInputElement).value).toBe('30');
			expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
		});
	});

	it('ties an out-of-range default to its field and disables Save', async () => {
		render(CriticalTasksDefaults, { orgId: 'org-a', settings, open: true });
		const expiration = screen.getByLabelText('Default expiration');
		const window = screen.getByLabelText('Expiring-soon window');
		const save = screen.getByRole('button', { name: 'Save' });

		await fireEvent.input(expiration, { target: { value: '0' } });

		expect(expiration.getAttribute('aria-invalid')).toBe('true');
		expect(describedBy(expiration)).toContain('Default expiration must be 1–120 months.');
		expect(window.getAttribute('aria-invalid')).toBeNull();
		expect((save as HTMLButtonElement).disabled).toBe(true);
	});

	it('reports a failed save as an alert, keeps the entered values and returns focus to Save', async () => {
		const fetch = vi.fn().mockResolvedValue(Response.json({ message: 'relation missing' }, { status: 500 }));
		vi.stubGlobal('fetch', fetch);
		render(CriticalTasksDefaults, { orgId: 'org-a', settings, open: true });
		const expiration = screen.getByLabelText('Default expiration') as HTMLInputElement;
		const window = screen.getByLabelText('Expiring-soon window') as HTMLInputElement;
		await fireEvent.input(expiration, { target: { value: '13' } });
		await fireEvent.input(window, { target: { value: '45' } });
		const save = screen.getByRole('button', { name: 'Save' });
		await fireEvent.click(save);

		const alert = await screen.findByRole('alert');
		expect(within(alert).getByText('Failed to save Critical Tasks defaults')).toBeTruthy();
		expect([expiration.value, window.value]).toEqual(['13', '45']);
		await waitFor(() => expect(document.activeElement).toBe(save));
	});

	it('shows why the server refused the defaults and keeps the entered values', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(Response.json({ message: 'Only Organization owners can change defaults.' }, { status: 403 }))
		);
		render(CriticalTasksDefaults, { orgId: 'org-a', settings, open: true });
		const expiration = screen.getByLabelText('Default expiration') as HTMLInputElement;
		await fireEvent.input(expiration, { target: { value: '13' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		const alert = await screen.findByRole('alert');
		expect(within(alert).getByText('Only Organization owners can change defaults.')).toBeTruthy();
		expect(expiration.value).toBe('13');
	});

	it('saves the defaults, closes the dialog without waiting for the refresh and refreshes Critical Tasks data', async () => {
		const fetch = vi.fn().mockResolvedValue(Response.json({}));
		vi.stubGlobal('fetch', fetch);
		vi.mocked(invalidate).mockReturnValueOnce(new Promise(() => {}));
		render(CriticalTasksDefaults, { orgId: 'org-a', settings, open: true });
		await fireEvent.input(screen.getByLabelText('Default expiration'), { target: { value: '24' } });
		await fireEvent.input(screen.getByLabelText('Expiring-soon window'), { target: { value: '90' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(fetch).toHaveBeenCalledTimes(1);
		const [url, init] = fetch.mock.calls[0];
		expect(url).toBe('/org/org-a/api/critical-tasks/settings');
		expect(JSON.parse(init.body)).toEqual({ defaultExpirationMonths: 24, expiringSoonWarningDays: 90 });
		expect(invalidate).toHaveBeenCalledWith('app:critical-tasks-data');
	});

	it('sends one request when Save is pressed again while the first is pending', async () => {
		let reply!: (response: Response) => void;
		const fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => (reply = resolve)));
		vi.stubGlobal('fetch', fetch);
		render(CriticalTasksDefaults, { orgId: 'org-a', settings, open: true });
		await fireEvent.input(screen.getByLabelText('Default expiration'), { target: { value: '24' } });
		const save = screen.getByRole('button', { name: 'Save' });
		await fireEvent.click(save);
		await fireEvent.click(save);

		expect(fetch).toHaveBeenCalledTimes(1);
		reply(Response.json({}));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('still refreshes Critical Tasks data when the dialog unmounts before the save succeeds', async () => {
		let reply!: (response: Response) => void;
		vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>((resolve) => (reply = resolve))));
		const view = render(CriticalTasksDefaults, { orgId: 'org-a', settings, open: true });
		await fireEvent.input(screen.getByLabelText('Default expiration'), { target: { value: '24' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
		view.unmount();

		reply(Response.json({}));
		await waitFor(() => expect(invalidate).toHaveBeenCalledWith('app:critical-tasks-data'));
	});

	it('discards the draft on Cancel and reopens on the saved values', async () => {
		const view = render(CriticalTasksDefaults, { orgId: 'org-a', settings, open: true });
		await fireEvent.input(screen.getByLabelText('Default expiration'), { target: { value: '99' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		await view.rerender({ orgId: 'org-a', settings, open: true });
		expect(((await screen.findByLabelText('Default expiration')) as HTMLInputElement).value).toBe('12');
	});
});
