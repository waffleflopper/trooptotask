// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { toastStore } from '$lib/stores/toast.svelte';

vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { params: { orgId: string } }) => void) {
			run({ params: { orgId: 'org-1' } });
			return () => {};
		}
	}
}));

import Page from './+page.svelte';

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

	it('uses a floating toolbar for save state instead of the old settings overview cards', () => {
		render(Page, {
			props: {
				data: {
					retentionMonths: 36,
					lossWarningWindowDays: 180,
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				} as never
			}
		});

		expect(screen.getByRole('toolbar', { name: 'Admin settings status' })).toBeTruthy();
		expect(screen.getByRole('status', { name: 'Saved' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Saved' })).toBeNull();
		expect(screen.queryByText('Change State')).toBeNull();
		expect(screen.queryByText('ICT Default')).toBeNull();
	});

	it('shows the loss warning control and saves the warning window through the settings endpoint', async () => {
		render(Page, {
			props: {
				data: {
					retentionMonths: 36,
					lossWarningWindowDays: 180,
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				} as never
			}
		});

		expect(screen.getByRole('heading', { name: 'Loss Warning Window' })).toBeTruthy();
		expect(screen.getByText('Operational Tracking')).toBeTruthy();
		const warningInput = screen.getByLabelText('Loss warning window (days)');
		expect((warningInput as HTMLInputElement).value).toBe('180');

		await fireEvent.input(warningInput, { target: { value: '90' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save Warning Window' }));

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith('/org/org-1/api/organization/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ lossWarningWindowDays: 90 })
			});
		});
	});

	it('shows the warning-window validation message when that field is invalid', async () => {
		render(Page, {
			props: {
				data: {
					retentionMonths: 36,
					lossWarningWindowDays: 180,
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				} as never
			}
		});

		const warningInput = screen.getByLabelText('Loss warning window (days)');
		await fireEvent.input(warningInput, { target: { value: '0' } });

		expect(screen.getByText('Must be between 1 and 365 days.')).toBeTruthy();
		expect(screen.queryByText('Must be between 1 and 120 months.')).toBeNull();
		expect((screen.getByRole('button', { name: 'Save Warning Window' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('renders the Critical Tasks settings section and saves organization defaults through the existing endpoint', async () => {
		const successToast = vi.spyOn(toastStore, 'success').mockImplementation(() => undefined);

		render(Page, {
			props: {
				data: {
					retentionMonths: 36,
					lossWarningWindowDays: 180,
					criticalTasksSettings: {
						defaultExpirationMonths: 12,
						expiringSoonWarningDays: 60
					}
				} as never
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
			expect(global.fetch).toHaveBeenCalledWith('/org/org-1/api/organization/settings', {
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
