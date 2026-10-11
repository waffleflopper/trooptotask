// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { frameworkOutcome, type FrameworkPage } from '$lib/test-support/sveltekitEnhance';
import { settleAction } from './settleAction';

function mount() {
	document.body.innerHTML = `
		<h2 tabindex="-1">Members</h2>
		<form><input name="email" value="" /><button type="submit">Invite</button></form>`;
	const form = document.querySelector('form')!;
	const page: FrameworkPage & { applied: unknown[] } = {
		form,
		applied: [],
		applyForm: async (data) => void page.applied.push(data)
	};
	return {
		form,
		input: form.querySelector('input')!,
		button: form.querySelector('button')!,
		heading: document.querySelector('h2')!,
		page
	};
}

function showAlert(form: HTMLFormElement, message: string | null) {
	form.querySelector('[role="alert"]')?.remove();
	if (message) form.insertAdjacentHTML('afterbegin', `<div role="alert">${message}</div>`);
}

function deferred() {
	let resolve!: () => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
	return { promise, resolve, reject };
}

afterEach(() => {
	document.body.innerHTML = '';
});

const current = () => true;
const requestErrorText = "The request didn't complete. Try again.";

describe('settleAction', () => {
	it('keeps the page and the draft on an unexpected error and renders its message', async () => {
		const { form, input, button, page } = mount();
		input.value = 'draft@example.mil';
		button.focus();

		await settleAction(frameworkOutcome({ type: 'error', status: 500, error: { message: 'Internal Error' } }, page), {
			isCurrent: current,
			settled: (error) => showAlert(form, error),
			focus: () => [button]
		});

		expect(form.querySelector('[role="alert"]')?.textContent).toBe(requestErrorText);
		expect(page.errorPage).toBeUndefined();
		expect(input.isConnected).toBe(true);
		expect(input.value).toBe('draft@example.mil');
		expect(document.activeElement).toBe(button);
	});

	it('applies a success and returns focus to the initiating control instead of the body', async () => {
		const { form, input, button, page } = mount();
		input.value = 'new@example.mil';
		button.focus();
		const errors: Array<string | null> = [];

		await settleAction(frameworkOutcome({ type: 'success', status: 200, data: { inviteSuccess: true } }, page), {
			isCurrent: current,
			settled: (error) => errors.push(error),
			focus: () => [button]
		});

		expect(errors).toEqual([null]);
		expect(page.applied).toEqual([{ inviteSuccess: true }]);
		expect(input.value).toBe('');
		expect(form.isConnected).toBe(true);
		expect(document.activeElement).toBe(button);
	});

	it('applies a failure so its field message renders', async () => {
		const { button, page } = mount();
		const errors: Array<string | null> = [];

		await settleAction(
			frameworkOutcome({ type: 'failure', status: 400, data: { inviteError: 'Email is invalid' } }, page),
			{ isCurrent: current, settled: (error) => errors.push(error), focus: () => [button] }
		);

		expect(errors).toEqual([null]);
		expect(page.applied).toEqual([{ inviteError: 'Email is invalid' }]);
		expect(document.activeElement).toBe(button);
	});

	it('moves focus to the fallback when the initiating control is gone or still disabled', async () => {
		const { form, button, heading, page } = mount();
		button.focus();
		button.disabled = true;
		const options = { isCurrent: current, settled: () => {}, focus: () => [button, heading] };

		await settleAction(frameworkOutcome({ type: 'success', status: 200 }, page), options);
		expect(document.activeElement).toBe(heading);

		button.disabled = false;
		form.remove();
		await settleAction(frameworkOutcome({ type: 'success', status: 200 }, page), options);
		expect(document.activeElement).toBe(heading);
	});

	it('ends busy state before choosing focus, so a re-enabled control keeps it', async () => {
		const { button, heading, page } = mount();
		button.disabled = true;

		await settleAction(frameworkOutcome({ type: 'failure', status: 503, data: {} }, page), {
			isCurrent: current,
			settled: () => (button.disabled = false),
			focus: () => [button, heading]
		});

		expect(document.activeElement).toBe(button);
	});

	it('scrolls the focused control into view after the error renders above it', async () => {
		const { form, button, page } = mount();
		button.focus();
		const scrolls: unknown[] = [];
		button.scrollIntoView = (options) =>
			void scrolls.push([form.querySelector('[role="alert"]')?.textContent, options]);

		await settleAction(frameworkOutcome({ type: 'error', status: 500, error: { message: 'Internal Error' } }, page), {
			isCurrent: current,
			settled: (error) => showAlert(form, error),
			focus: () => [button]
		});

		expect(scrolls).toEqual([[requestErrorText, { block: 'nearest' }]]);
		expect(document.activeElement).toBe(button);
	});

	it('ends busy state when the refresh after a success rejects', async () => {
		const { button, page } = mount();
		button.disabled = true;
		page.invalidate = () => Promise.reject(new Error('offline'));

		const settling = settleAction(frameworkOutcome({ type: 'success', status: 200 }, page), {
			isCurrent: current,
			settled: () => (button.disabled = false),
			focus: () => [button]
		});

		await expect(settling).rejects.toThrow('offline');
		expect(button.disabled).toBe(false);
	});

	it('changes nothing when the response arrives after the view is gone', async () => {
		const { form, button, heading, page } = mount();
		heading.focus();
		page.away = true;
		const errors: Array<string | null> = [];

		await settleAction(
			frameworkOutcome({ type: 'failure', status: 400, data: { inviteError: 'Email is invalid' } }, page),
			{ isCurrent: () => false, settled: (error) => errors.push(error), focus: () => [button] }
		);
		await settleAction(frameworkOutcome({ type: 'error', status: 500, error: { message: 'Internal Error' } }, page), {
			isCurrent: () => false,
			settled: (error) => errors.push(error),
			focus: () => [button]
		});

		expect(errors).toEqual([]);
		expect(page.applied).toEqual([]);
		expect(page.errorPage).toBeUndefined();
		expect(form.querySelector('[role="alert"]')).toBeNull();
		expect(document.activeElement).toBe(heading);
	});

	it('neither settles nor moves focus when the view goes while its refresh is pending', async () => {
		const { button, heading, page } = mount();
		const refresh = deferred();
		page.invalidate = () => refresh.promise;
		let live = true;
		const errors: Array<string | null> = [];
		button.focus();

		const settling = settleAction(frameworkOutcome({ type: 'success', status: 200 }, page), {
			isCurrent: () => live,
			settled: (error) => errors.push(error),
			focus: () => [button]
		});
		live = false;
		page.away = true;
		heading.focus();
		refresh.resolve();
		await settling;

		expect(errors).toEqual([]);
		expect(document.activeElement).toBe(heading);
	});

	it('returns focus to the control after a redirect that keeps the page', async () => {
		const { button, page } = mount();
		button.focus();
		const errors: Array<string | null> = [];

		await settleAction(
			frameworkOutcome({ type: 'redirect', status: 303, location: '/org/new-path/settings/general' }, page),
			{ isCurrent: current, settled: (error) => errors.push(error), focus: () => [button] }
		);

		expect(errors).toEqual([null]);
		expect(page.location).toBe('/org/new-path/settings/general');
		expect(document.activeElement).toBe(button);
	});

	it('leaves focus to the framework after a redirect to another page', async () => {
		const { button, heading, page } = mount();
		page.navigate = async () => void document.body.replaceChildren(document.createElement('main'));

		await settleAction(frameworkOutcome({ type: 'redirect', status: 303, location: '/org/b' }, page), {
			isCurrent: current,
			settled: () => {},
			focus: () => [button, heading]
		});

		expect(page.location).toBe('/org/b');
		expect(document.activeElement).toBe(document.body);
	});
});
