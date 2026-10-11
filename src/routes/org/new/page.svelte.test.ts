// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import {
	enhanceRequests,
	frameworkOutcome,
	simulateEnhance,
	type FrameworkPage
} from '$lib/test-support/sveltekitEnhance';

const { pageState } = vi.hoisted(() => ({ pageState: { status: 200 } }));
vi.mock('$app/forms', () => ({ enhance: simulateEnhance }));
vi.mock('$app/state', () => ({ page: pageState }));

import Page from './+page.svelte';
import type { PageData } from './$types';

afterEach(() => {
	cleanup();
	pageState.status = 200;
	enhanceRequests.length = 0;
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
		const view = render(Page, {
			props: { data: makePageData(), form: { error: 'Organization name is required' } }
		});

		const name = screen.getByLabelText('Organization Name') as HTMLInputElement;
		expect(name.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(name.getAttribute('aria-describedby') ?? '')?.textContent?.trim()).toBe(
			'Organization name is required'
		);
		expect(screen.getByRole('alert')).toBe(document.getElementById(name.getAttribute('aria-describedby') ?? ''));

		await fireEvent.input(name, { target: { value: ' ' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Organization' }));
		await enhanceRequests[0](
			frameworkOutcome(
				{ type: 'failure', status: 400, data: { error: 'Organization name is required' } },
				{ applyForm: (form) => view.rerender({ form: form as never }) }
			)
		);
		await waitFor(() => expect(document.activeElement).toBe(name));
	});

	it('keeps the typed name with an Alert when creation errors unexpectedly, and refocuses Create', async () => {
		const view = render(Page, { props: { data: makePageData(), form: null } });
		await fireEvent.input(screen.getByLabelText('Organization Name'), { target: { value: '2nd Battalion' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Create Organization' }));
		await enhanceRequests[0](
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

	it('keeps focus on Create and sends one request while creation is pending', async () => {
		render(Page, { props: { data: makePageData(), form: null } });
		await fireEvent.input(screen.getByLabelText('Organization Name'), { target: { value: '2nd Battalion' } });
		const create = screen.getByRole('button', { name: 'Create Organization' }) as HTMLButtonElement;
		create.focus();

		await fireEvent.click(create);
		await fireEvent.click(create);

		expect(enhanceRequests).toHaveLength(1);
		expect(create.disabled).toBe(false);
		expect(create.getAttribute('aria-disabled')).toBe('true');
		expect(create.textContent?.trim()).toBe('Creating...');
		expect(document.activeElement).toBe(create);
	});

	it('drops the earlier failure when a retry starts and keeps the typed name', async () => {
		pageState.status = 503;
		const view = render(Page, {
			props: { data: makePageData(), form: { error: 'Synthetic request failure' } }
		});
		await fireEvent.input(screen.getByLabelText('Organization Name'), { target: { value: '2nd Battalion' } });
		expect(screen.getByRole('alert').textContent?.trim()).toBe('Synthetic request failure');

		await fireEvent.click(screen.getByRole('button', { name: 'Create Organization' }));

		expect(screen.queryByRole('alert')).toBeNull();
		expect((screen.getByLabelText('Organization Name') as HTMLInputElement).value).toBe('2nd Battalion');

		await enhanceRequests[0](
			frameworkOutcome(
				{ type: 'error', status: 500, error: { message: 'Internal Error' } },
				{ applyForm: (form) => view.rerender({ form: form as never }) }
			)
		);
		await waitFor(() =>
			expect(screen.getByRole('alert').textContent?.trim()).toBe("The request didn't complete. Try again.")
		);
	});

	it('drops a corrected name error when the retry errors unexpectedly', async () => {
		pageState.status = 400;
		const view = render(Page, { props: { data: makePageData(), form: null } });
		const page = { applyForm: (form: unknown) => view.rerender({ form: form as never }) };
		const name = screen.getByLabelText('Organization Name') as HTMLInputElement;
		const create = screen.getByRole('button', { name: 'Create Organization' });
		await fireEvent.input(name, { target: { value: 'Taken' } });
		await fireEvent.click(create);
		await enhanceRequests[0](
			frameworkOutcome({ type: 'failure', status: 400, data: { error: 'Name is already in use' } }, page)
		);
		await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'));

		await fireEvent.input(name, { target: { value: '2nd Battalion' } });
		await fireEvent.click(create);
		await enhanceRequests[1](
			frameworkOutcome({ type: 'error', status: 500, error: { message: 'Internal Error' } }, page)
		);

		await waitFor(() =>
			expect(screen.getByRole('alert').textContent?.trim()).toBe("The request didn't complete. Try again.")
		);
		expect(screen.getAllByRole('alert')).toHaveLength(1);
		expect(name.getAttribute('aria-invalid')).toBeNull();
		expect(name.value).toBe('2nd Battalion');
		expect(document.activeElement).toBe(create);
	});

	it('does not navigate to the new Organization when its response arrives after the user left', async () => {
		const view = render(Page, { props: { data: makePageData(), form: null } });
		await fireEvent.input(screen.getByLabelText('Organization Name'), { target: { value: '2nd Battalion' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create Organization' }));
		const late = enhanceRequests[0];
		view.unmount();
		const page: FrameworkPage = { applyForm: async () => {} };

		await late(frameworkOutcome({ type: 'redirect', status: 303, location: '/org/2nd-battalion' }, page));

		expect(page.location).toBeUndefined();
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
