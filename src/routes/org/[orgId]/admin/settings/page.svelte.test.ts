// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';

vi.mock('$app/stores', () => ({
	page: {
		subscribe(run: (value: { params: { orgId: string } }) => void) {
			run({ params: { orgId: 'org-1' } });
			return () => {};
		}
	}
}));

vi.mock('$lib/components/PageToolbar.svelte', () => ({
	default: VisibleStub
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
	});

	it('shows the loss warning control and saves the warning window through the settings endpoint', async () => {
		render(Page, {
			props: {
				data: {
					retentionMonths: 36,
					lossWarningWindowDays: 180
				} as never
			}
		});

		expect(screen.getByRole('heading', { name: 'Loss Warning Window' })).toBeTruthy();
		expect(screen.getByText('Operational Tracking')).toBeTruthy();
		const warningInput = screen.getByLabelText('Loss warning window (days)');
		expect((warningInput as HTMLInputElement).value).toBe('180');

		await fireEvent.input(warningInput, { target: { value: '90' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith('/org/org-1/api/organization/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ archiveRetentionMonths: 36, lossWarningWindowDays: 90 })
			});
		});
	});

	it('shows the warning-window validation message when that field is invalid', async () => {
		render(Page, {
			props: {
				data: {
					retentionMonths: 36,
					lossWarningWindowDays: 180
				} as never
			}
		});

		const warningInput = screen.getByLabelText('Loss warning window (days)');
		await fireEvent.input(warningInput, { target: { value: '0' } });

		expect(screen.getByText('Must be between 1 and 365 days.')).toBeTruthy();
		expect(screen.queryByText('Must be between 1 and 120 months.')).toBeNull();
		expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
	});
});
