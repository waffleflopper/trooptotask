// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CriticalTasksDefaults from './CriticalTasksDefaults.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }));

afterEach(() => {
	cleanup();
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
			settings: { defaultExpirationMonths: 12, expiringSoonWarningDays: 60 }
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

	it('describes each default, ties an out-of-range value to its field and states why Save is off', async () => {
		render(CriticalTasksDefaults, { orgId: 'org-a', settings });
		const expiration = screen.getByLabelText('Default expiration');
		const window = screen.getByLabelText('Expiring-soon window');
		const save = screen.getByRole('button', { name: 'Save' });
		expect(describedBy(expiration)).toEqual(['Used when a task has no expiration override.']);
		expect(describedBy(window)).toEqual(['When a current task becomes expiring soon.']);
		expect(save.getAttribute('title')).toBe('No changes to save.');

		await fireEvent.input(expiration, { target: { value: '0' } });

		expect(expiration.getAttribute('aria-invalid')).toBe('true');
		expect(describedBy(expiration)).toEqual([
			'Used when a task has no expiration override.',
			'Default expiration must be 1–120 months.'
		]);
		expect(window.getAttribute('aria-invalid')).toBeNull();
		expect((save as HTMLButtonElement).disabled).toBe(true);
		expect(save.getAttribute('title')).toBe('Fix the highlighted defaults before saving.');
	});

	it('reports a failed save as an alert, keeps the entered values and returns focus to Save', async () => {
		const fetch = vi.fn().mockResolvedValue({ ok: false });
		vi.stubGlobal('fetch', fetch);
		render(CriticalTasksDefaults, { orgId: 'org-a', settings });
		const expiration = screen.getByLabelText('Default expiration') as HTMLInputElement;
		await fireEvent.input(expiration, { target: { value: '13' } });
		const save = screen.getByRole('button', { name: 'Save' });
		await fireEvent.click(save);

		const alert = await screen.findByRole('alert');
		expect(alert.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Failed to save Critical Tasks defaults Your entered defaults are kept. Try Save again.'
		);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(expiration.value).toBe('13');
		await waitFor(() => expect(document.activeElement).toBe(save));
	});
});
