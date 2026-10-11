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

afterEach(() => {
	document.body.innerHTML = '';
});

describe('settleAction', () => {
	it('keeps the page and the draft on an unexpected error and returns a message', async () => {
		const { input, button, page } = mount();
		input.value = 'draft@example.mil';
		button.focus();

		const message = await settleAction(
			frameworkOutcome({ type: 'error', status: 500, error: { message: 'Internal Error' } }, page),
			{ focus: () => [button] }
		);

		expect(message).toBe("The request didn't complete. Your entries are still here. Try again.");
		expect(page.errorPage).toBeUndefined();
		expect(input.isConnected).toBe(true);
		expect(input.value).toBe('draft@example.mil');
		expect(document.activeElement).toBe(button);
	});

	it('applies a success and returns focus to the initiating control instead of the body', async () => {
		const { input, button, page } = mount();
		input.value = 'new@example.mil';
		button.focus();

		const message = await settleAction(
			frameworkOutcome({ type: 'success', status: 200, data: { inviteSuccess: true } }, page),
			{ focus: () => [button] }
		);

		expect(message).toBeNull();
		expect(page.applied).toEqual([{ inviteSuccess: true }]);
		expect(input.value).toBe('');
		expect(document.activeElement).toBe(button);
	});

	it('applies a failure so its field message renders', async () => {
		const { button, page } = mount();

		const message = await settleAction(
			frameworkOutcome({ type: 'failure', status: 400, data: { inviteError: 'Email is invalid' } }, page),
			{ focus: () => [button] }
		);

		expect(message).toBeNull();
		expect(page.applied).toEqual([{ inviteError: 'Email is invalid' }]);
		expect(document.activeElement).toBe(button);
	});

	it('moves focus to the fallback when the initiating control is gone or still disabled', async () => {
		const { form, button, heading, page } = mount();
		button.focus();
		button.disabled = true;

		await settleAction(frameworkOutcome({ type: 'success', status: 200 }, page), {
			focus: () => [button, heading]
		});
		expect(document.activeElement).toBe(heading);

		button.disabled = false;
		form.remove();
		await settleAction(frameworkOutcome({ type: 'success', status: 200 }, page), {
			focus: () => [button, heading]
		});
		expect(document.activeElement).toBe(heading);
	});

	it('ends busy state before choosing focus, so a re-enabled control keeps it', async () => {
		const { button, heading, page } = mount();
		button.disabled = true;

		await settleAction(frameworkOutcome({ type: 'failure', status: 503, data: {} }, page), {
			focus: () => [button, heading],
			settled: () => (button.disabled = false)
		});

		expect(document.activeElement).toBe(button);
	});

	it('hands a redirect to the framework', async () => {
		const { button, page } = mount();

		const message = await settleAction(frameworkOutcome({ type: 'redirect', status: 303, location: '/org/b' }, page), {
			focus: () => [button]
		});

		expect(message).toBeNull();
		expect(page.location).toBe('/org/b');
	});
});
