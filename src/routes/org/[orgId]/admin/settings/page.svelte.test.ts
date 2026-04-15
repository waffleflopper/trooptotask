// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { readable } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';
import { toastStore } from '$lib/stores/toast.svelte';

vi.mock('$app/stores', () => ({
	page: readable({
		params: { orgId: 'org-1' },
		url: new URL('http://localhost/org/org-1/admin/settings')
	})
}));

describe('admin settings page', () => {
	beforeEach(() => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true
			})
		);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('renders the Critical Tasks settings section and saves organization defaults through the existing endpoint', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => undefined);

		render(Page, {
			props: {
				data: {
					session: null,
					orgId: 'org-1',
					orgName: 'Test Unit',
					retentionMonths: 36,
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				}
			}
		});

		expect(screen.getByRole('heading', { name: 'Critical Tasks' })).toBeTruthy();
		expect((screen.getByLabelText('Default expiration (months)') as HTMLInputElement).value).toBe('12');
		expect((screen.getByLabelText('Expiring soon window (days)') as HTMLInputElement).value).toBe('60');

		await fireEvent.input(screen.getByLabelText('Default expiration (months)'), {
			target: { value: '18' }
		});
		await fireEvent.input(screen.getByLabelText('Expiring soon window (days)'), {
			target: { value: '45' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Save Critical Tasks' }));

		await waitFor(() => {
			expect(fetch).toHaveBeenCalledWith('/org/org-1/api/organization/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					criticalTasksDefaultExpirationMonths: 18,
					criticalTasksExpiringSoonWarningDays: 45
				})
			});
			expect(successToast).toHaveBeenCalledWith('Settings saved');
		});
	});
});
