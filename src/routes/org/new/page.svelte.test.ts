// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

vi.mock('$app/forms', () => ({
	enhance: () => {}
}));

import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
});

function makePageData(overrides: Partial<PageData> = {}): PageData {
	return {
		session: null,
		emailConfirmed: true,
		userEmail: 'owner@example.com',
		emailConfirmationMessage: undefined,
		...overrides
	} as PageData;
}

describe('/org/new page', () => {
	it('presents confirmed users with deliberate first-organization setup copy', () => {
		render(Page, {
			props: {
				data: makePageData(),
				form: null
			}
		});

		expect(screen.getByText('First Organization Setup')).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Create your first Organization' })).toBeTruthy();
		expect(screen.getByText(/owner dashboard with the first-run setup checklist/)).toBeTruthy();
		expect(screen.queryByTestId('org-new-status')).toBeNull();
		expect((screen.getByLabelText('Organization Name') as HTMLInputElement).disabled).toBe(false);
		expect((screen.getByRole('button', { name: 'Create Organization' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('blocks unconfirmed users in the visible page state', () => {
		render(Page, {
			props: {
				data: makePageData({
					emailConfirmed: false,
					userEmail: 'pending@example.com',
					emailConfirmationMessage: 'Confirm your email before creating an Organization.'
				}),
				form: null
			}
		});

		expect(screen.getByRole('heading', { name: 'Confirm your email first' })).toBeTruthy();
		expect(screen.getByText(/Open the newest confirmation email for pending@example.com/)).toBeTruthy();
		expect(screen.getByTestId('org-new-status').textContent).toContain('Email confirmation required');
		expect(screen.getByText(/Confirm your email before creating an Organization/)).toBeTruthy();
		expect((screen.getByLabelText('Organization Name') as HTMLInputElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Create Organization' }) as HTMLButtonElement).disabled).toBe(true);
	});
});
