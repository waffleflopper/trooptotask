// @vitest-environment happy-dom
import type { ActionResult } from '@sveltejs/kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';

type Submit = () => (options: { result: ActionResult; update: () => Promise<void> }) => Promise<void>;
const forms = vi.hoisted(() => ({ submit: null as Submit | null }));
const { pageState } = vi.hoisted(() => ({ pageState: { status: 200 } }));
vi.mock('$app/forms', () => ({
	enhance: (_form: HTMLFormElement, submit: Submit) => {
		forms.submit = submit;
	}
}));
vi.mock('$app/state', () => ({ page: pageState }));

import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
	pageState.status = 200;
	forms.submit = null;
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

	it('associates a rejected name with its field and returns focus to it', async () => {
		pageState.status = 400;
		render(Page, { props: { data: makePageData(), form: { error: 'Organization name is required' } } });

		const name = screen.getByLabelText('Organization Name') as HTMLInputElement;
		expect(name.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(name.getAttribute('aria-describedby') ?? '')?.textContent?.trim()).toBe(
			'Organization name is required'
		);
		expect(screen.getByRole('alert')).toBe(document.getElementById(name.getAttribute('aria-describedby') ?? ''));

		await forms.submit?.()(
			frameworkOutcome(
				{ type: 'failure', status: 400, data: { error: 'Organization name is required' } },
				{ applyForm: async () => {} }
			)
		);
		await waitFor(() => expect(document.activeElement).toBe(name));
	});

	it('keeps the typed name with an Alert when creation errors unexpectedly, and refocuses Create', async () => {
		const view = render(Page, { props: { data: makePageData(), form: null } });
		await fireEvent.input(screen.getByLabelText('Organization Name'), { target: { value: '2nd Battalion' } });

		await forms.submit?.()(
			frameworkOutcome(
				{ type: 'error', status: 500, error: { message: 'Internal Error' } },
				{ applyForm: (form) => view.rerender({ form: form as never }) }
			)
		);

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect((screen.getByLabelText('Organization Name') as HTMLInputElement).value).toBe('2nd Battalion');
		expect(screen.getByLabelText('Organization Name').getAttribute('aria-invalid')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create Organization' }));
	});

	it('reports a request failure in an Alert without marking the name invalid', () => {
		pageState.status = 503;
		render(Page, {
			props: {
				data: makePageData(),
				form: { error: 'Unable to verify email confirmation right now. Try again in a moment.' }
			}
		});

		expect(screen.getByRole('alert').textContent?.trim()).toBe(
			'Unable to verify email confirmation right now. Try again in a moment.'
		);
		expect(screen.getByLabelText('Organization Name').getAttribute('aria-invalid')).toBeNull();
	});
});
