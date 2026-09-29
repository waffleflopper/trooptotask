// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CriticalTasksDefaults from './CriticalTasksDefaults.svelte';

vi.mock('$app/navigation', () => ({ invalidate: vi.fn().mockResolvedValue(undefined) }));

afterEach(() => cleanup());

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
});
