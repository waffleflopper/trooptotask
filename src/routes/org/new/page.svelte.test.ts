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
		viewer: null,
		emailConfirmed: true,
		emailConfirmationUnavailable: false,
		userEmail: 'owner@example.com',
		emailConfirmationMessage: undefined,
		requestId: 'load-request-id',
		...overrides
	} as PageData;
}

describe('/org/new page', () => {
	it('contains Organization setup in one main landmark', () => {
		render(Page, {
			props: {
				data: makePageData(),
				form: null
			}
		});

		expect(screen.getAllByRole('main')).toHaveLength(1);
	});

	it('keeps the request id and the name typed since submitting when a failure arrives', async () => {
		pageState.status = 503;
		const view = render(Page, { props: { data: makePageData(), form: null } });
		const requestId = () => (document.querySelector('input[name="requestId"]') as HTMLInputElement).value;
		const name = screen.getByLabelText('Organization name') as HTMLInputElement;
		expect(requestId()).toBe('load-request-id');
		await fireEvent.input(name, { target: { value: '2nd Battalion' } });

		await view.rerender({
			form: { error: 'We could not confirm that.', name: '1st Battalion', requestId: 'load-request-id' }
		});

		expect(requestId()).toBe('load-request-id');
		expect(name.value).toBe('2nd Battalion');
		expect(screen.getByRole('alert').textContent?.trim()).toBe('We could not confirm that.');
		expect(name.getAttribute('aria-invalid')).toBeNull();
	});

	it('renders the submitted name when a failure arrives as a full page render', () => {
		pageState.status = 503;
		render(Page, {
			props: {
				data: makePageData(),
				form: { error: 'We could not confirm that.', name: '1st Battalion', requestId: 'load-request-id' }
			}
		});
		expect((screen.getByLabelText('Organization name') as HTMLInputElement).value).toBe('1st Battalion');
	});

	it('uses the request id the server returns with a failure', async () => {
		pageState.status = 400;
		render(Page, {
			props: {
				data: makePageData(),
				form: {
					error: 'Organization name is required',
					name: 'Alpha',
					requestId: 'fresh-id'
				}
			}
		});
		expect((document.querySelector('input[name="requestId"]') as HTMLInputElement).value).toBe('fresh-id');
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

		expect(screen.getByRole('status').textContent).toContain('pending@example.com');
		expect((screen.getByLabelText('Organization name') as HTMLInputElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Create and start setup' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('associates a rejected name with its field and returns focus to it', async () => {
		pageState.status = 400;
		const view = render(Page, {
			props: {
				data: makePageData(),
				form: { error: 'Organization name is required', name: ' ', requestId: 'load-request-id' }
			}
		});

		const name = screen.getByLabelText('Organization name') as HTMLInputElement;
		expect(name.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(name.getAttribute('aria-describedby') ?? '')?.textContent?.trim()).toBe(
			'Organization name is required'
		);
		expect(screen.getByRole('alert')).toBe(document.getElementById(name.getAttribute('aria-describedby') ?? ''));

		await fireEvent.input(name, { target: { value: ' ' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create and start setup' }));
		await enhanceRequests[0](
			frameworkOutcome(
				{ type: 'failure', status: 400, location: '/', data: { error: 'Organization name is required' } },
				{ applyForm: (form) => view.rerender({ form: form as never }) }
			)
		);
		await waitFor(() => expect(document.activeElement).toBe(name));
	});

	it('keeps the typed name with an Alert when creation errors unexpectedly, and refocuses Create', async () => {
		const view = render(Page, { props: { data: makePageData(), form: null } });
		await fireEvent.input(screen.getByLabelText('Organization name'), { target: { value: '2nd Battalion' } });

		await fireEvent.click(screen.getByRole('button', { name: 'Create and start setup' }));
		await enhanceRequests[0](
			frameworkOutcome(
				{ type: 'error', status: 500, error: { status: 500, message: 'Internal Error' } },
				{ applyForm: (form) => view.rerender({ form: form as never }) }
			)
		);

		await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
		expect((screen.getByLabelText('Organization name') as HTMLInputElement).value).toBe('2nd Battalion');
		expect(screen.getByLabelText('Organization name').getAttribute('aria-invalid')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create and start setup' }));
	});

	it('keeps focus on Create and sends one request while creation is pending', async () => {
		render(Page, { props: { data: makePageData(), form: null } });
		await fireEvent.input(screen.getByLabelText('Organization name'), { target: { value: '2nd Battalion' } });
		const create = screen.getByRole('button', { name: 'Create and start setup' }) as HTMLButtonElement;
		create.focus();

		await fireEvent.click(create);
		await fireEvent.click(create);

		expect(enhanceRequests).toHaveLength(1);
		expect(create.disabled).toBe(false);
		expect(create.getAttribute('aria-disabled')).toBe('true');
		expect(create.textContent).toContain('2nd Battalion');
		expect(document.activeElement).toBe(create);
	});

	it('drops the earlier failure when a retry starts and keeps the typed name', async () => {
		pageState.status = 503;
		const view = render(Page, {
			props: {
				data: makePageData(),
				form: { error: 'Synthetic request failure', name: '2nd Battalion', requestId: 'load-request-id' }
			}
		});
		await fireEvent.input(screen.getByLabelText('Organization name'), { target: { value: '2nd Battalion' } });
		expect(screen.getByRole('alert').textContent?.trim()).toBe('Synthetic request failure');

		await fireEvent.click(screen.getByRole('button', { name: 'Create and start setup' }));

		expect(screen.queryByRole('alert')).toBeNull();
		expect((screen.getByLabelText('Organization name') as HTMLInputElement).value).toBe('2nd Battalion');

		await enhanceRequests[0](
			frameworkOutcome(
				{ type: 'error', status: 500, error: { status: 500, message: 'Internal Error' } },
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
		const name = screen.getByLabelText('Organization name') as HTMLInputElement;
		const create = screen.getByRole('button', { name: 'Create and start setup' });
		await fireEvent.input(name, { target: { value: 'Taken' } });
		await fireEvent.click(create);
		await enhanceRequests[0](
			frameworkOutcome({ type: 'failure', status: 400, location: '/', data: { error: 'Name is already in use' } }, page)
		);
		await waitFor(() => expect(name.getAttribute('aria-invalid')).toBe('true'));

		await fireEvent.input(name, { target: { value: '2nd Battalion' } });
		await fireEvent.click(create);
		await enhanceRequests[1](
			frameworkOutcome({ type: 'error', status: 500, error: { status: 500, message: 'Internal Error' } }, page)
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
		await fireEvent.input(screen.getByLabelText('Organization name'), { target: { value: '2nd Battalion' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Create and start setup' }));
		const late = enhanceRequests[0];
		view.unmount();
		const page: FrameworkPage = { applyForm: async () => {} };

		await late(frameworkOutcome({ type: 'redirect', status: 303, location: '/org/2nd-battalion' }, page));

		expect(page.location).toBeUndefined();
	});
});
