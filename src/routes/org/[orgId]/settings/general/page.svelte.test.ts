// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import Page from './+page.svelte';

const { enhancements, callbacks, toasts } = vi.hoisted(() => ({
	enhancements: new Map<string, (input: { cancel: () => void }) => unknown>(),
	callbacks: [] as Array<(input: unknown) => Promise<void>>,
	toasts: [] as string[]
}));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: { success: (message: string) => toasts.push(message) } }));
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: (input: { cancel: () => void }) => unknown) => {
		const action = node.getAttribute('action')!;
		enhancements.set(action, submit);
		const listener = (event: Event) => {
			event.preventDefault();
			const callback = submit({ cancel: () => {} });
			if (typeof callback === 'function') callbacks.push(callback as (input: unknown) => Promise<void>);
		};
		node.addEventListener('submit', listener);
		return { destroy: () => node.removeEventListener('submit', listener) };
	}
}));

function data(orgId: string, urlSlug: string | null = 'example-unit') {
	return {
		orgId,
		generalSettings: {
			currentMember: { role: 'owner', isOwner: true, isAdmin: false, canManageMembers: true },
			sections: {
				organization: {
					id: orgId,
					name: 'Example Organization',
					urlSlug,
					urlSegment: urlSlug ?? orgId,
					canUpdateProfile: true,
					canUpdateUrlSlug: true
				}
			}
		}
	} as unknown as ComponentProps<typeof Page>['data'];
}

beforeEach(() => {
	enhancements.clear();
	callbacks.length = 0;
	toasts.length = 0;
	vi.useFakeTimers();
});
afterEach(async () => {
	cleanup();
	await vi.runAllTimersAsync();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function beginNameSave() {
	await fireEvent.click(screen.getByRole('button', { name: 'Edit organization name' }));
	enhancements.get('?/updateName')!({ cancel: () => {} });
	await tick();
	await fireEvent.click(screen.getByRole('button', { name: 'Update Name' }));
	return callbacks.at(-1)!;
}

describe('General settings Organization lifetime', () => {
	it('discards confirmations and drafts when switching between Organizations with equal profiles', async () => {
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit organization name' }));
		await fireEvent.input(screen.getByLabelText('Organization name'), { target: { value: 'Unsaved Alpha' } });
		enhancements.get('?/updateName')!({ cancel: () => {} });
		await tick();
		expect(screen.getByRole('dialog')).toBeTruthy();
		await view.rerender({ data: data('b'), form: null });
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(screen.queryByLabelText('Organization name')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Edit organization name' }));
		expect((screen.getByLabelText('Organization name') as HTMLInputElement).value).toBe('Example Organization');
	});

	it.each(['success', 'failure', 'error', 'redirect'] as const)(
		'ignores a disposed name response (%s) after A → B → A',
		async (type) => {
			const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
			const oldCallback = await beginNameSave();
			await view.rerender({ data: data('b'), form: null });
			await view.rerender({ data: data('a'), form: null });
			const newCallback = await beginNameSave();
			const update = vi.fn();
			await oldCallback({
				result: {
					type,
					status: type === 'redirect' ? 303 : 403,
					data: { requiresStepUp: true },
					location: '/org/a/settings/general'
				},
				update
			});
			expect(update).not.toHaveBeenCalled();
			expect(screen.getByRole('button', { name: 'Saving...' })).toBeTruthy();
			await newCallback({ result: { type: 'success', status: 200, data: { nameSuccess: true } }, update });
			expect(update).toHaveBeenCalledOnce();
			expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
		}
	);
	it.each(['success', 'failure', 'error', 'redirect'] as const)(
		'ignores a disposed slug response (%s) while a fresh A request remains pending',
		async (type) => {
			const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
			enhancements.get('?/updateSlug')!({ cancel: () => {} });
			await tick();
			await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update URL' }));
			const oldCallback = callbacks.at(-1)!;
			await view.rerender({ data: data('b'), form: null });
			await view.rerender({ data: data('a'), form: null });
			enhancements.get('?/updateSlug')!({ cancel: () => {} });
			await tick();
			await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update URL' }));
			const freshCallback = callbacks.at(-1)!;
			const update = vi.fn();
			await oldCallback({
				result: { type, status: 303, location: '/org/changed/settings/general', data: { requiresStepUp: true } },
				update
			});
			expect(update).not.toHaveBeenCalled();
			expect(screen.getByRole('button', { name: 'Saving...' })).toBeTruthy();
			await freshCallback({
				result: { type: 'failure', status: 400, data: { slugError: 'Choose another URL' } },
				update
			});
			expect(update).toHaveBeenCalledOnce();
			expect(screen.getByRole('button', { name: 'Update URL' })).toBeTruthy();
		}
	);

	it('requires a fresh reset confirmation after switching and submits the reset action after its form updates', async () => {
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
		expect(screen.getByRole('dialog')).toBeTruthy();
		await view.rerender({ data: data('b'), form: null });
		expect(screen.queryByRole('dialog')).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
		const submittedActions: string[] = [];
		const original = HTMLFormElement.prototype.requestSubmit;
		vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(function (this: HTMLFormElement) {
			submittedActions.push(this.getAttribute('action')!);
			original.call(this);
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Reset URL' }));
		expect(submittedActions).toEqual(['?/clearSlug']);
		const callback = callbacks.at(-1)!;
		await callback({ result: { type: 'failure', status: 400, data: { slugError: 'Retry reset' } }, update: vi.fn() });
		await tick();
		const slugForm = screen.getByLabelText('Custom path').closest('form')!;
		expect(slugForm.getAttribute('action')).toBe('?/updateSlug');
	});
	it.each(['success', 'failure', 'error', 'redirect'] as const)(
		'discards a disposed reset response (%s) and keeps the next Organization slug action at update',
		async (type) => {
			const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
			await fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Reset URL' }));
			const oldCallback = callbacks.at(-1)!;
			await view.rerender({ data: data('b'), form: null });
			const update = vi.fn();
			await oldCallback({
				result: { type, status: 303, location: '/org/a/settings/general', data: { requiresStepUp: true } },
				update
			});
			expect(update).not.toHaveBeenCalled();
			expect(screen.queryByRole('button', { name: 'Saving...' })).toBeNull();
			expect(screen.getByLabelText('Custom path').closest('form')!.getAttribute('action')).toBe('?/updateSlug');
			enhancements.get('?/updateSlug')!({ cancel: () => {} });
			await tick();
			expect(screen.getByRole('dialog', { name: 'Update custom URL?' })).toBeTruthy();
		}
	);
});

describe('General settings feedback and focus', () => {
	it('moves focus into the name editor and back to its Edit button on cancel', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit organization name' }));
		await tick();
		expect(document.activeElement).toBe(screen.getByLabelText('Organization name'));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await tick();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit organization name' }));
	});

	it('announces a saved name as status and returns focus to Edit', async () => {
		render(Page, { data: data('a'), form: { nameSuccess: true }, params: { orgId: 'a' } });
		await tick();
		screen.getByRole('status');
		expect(screen.queryByRole('alert')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit organization name' }));
	});

	it('associates a rejected name with its field and focuses it', async () => {
		render(Page, { data: data('a'), form: { error: 'Name is taken' }, params: { orgId: 'a' } });
		await tick();
		const name = screen.getByLabelText('Organization name');
		expect(name.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(name.getAttribute('aria-describedby') ?? '')?.textContent?.trim()).toBe(
			'Name is taken'
		);
		expect(document.activeElement).toBe(name);
	});

	it('associates a rejected custom path with its field and focuses it', async () => {
		render(Page, { data: data('a'), form: { slugError: 'Choose another URL' }, params: { orgId: 'a' } });
		await tick();
		const slug = screen.getByLabelText('Custom path');
		expect(slug.getAttribute('aria-invalid')).toBe('true');
		const descriptions = (slug.getAttribute('aria-describedby') ?? '')
			.split(' ')
			.map((id) => document.getElementById(id)?.textContent?.trim());
		expect(descriptions).toContain('Choose another URL');
		expect(document.activeElement).toBe(slug);
	});

	it('keeps the typed name in place with an Alert when the save errors unexpectedly', async () => {
		const view = render(Page, { data: data('a'), form: { nameSuccess: true }, params: { orgId: 'a' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit organization name' }));
		await fireEvent.input(screen.getByLabelText('Organization name'), { target: { value: 'Draft Name' } });
		enhancements.get('?/updateName')!({ cancel: () => {} });
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: 'Update Name' }));
		const callback = callbacks.at(-1)!;
		const page = { applyForm: (form: unknown) => view.rerender({ form: form as never }) };

		await callback(frameworkOutcome({ type: 'error', status: 500, error: { message: 'Internal Error' } }, page));
		await tick();

		const nameForm = screen.getByLabelText('Organization name').closest('form')!;
		expect(page).not.toHaveProperty('errorPage');
		expect(within(nameForm).getByRole('alert').textContent?.trim()).toBe("The request didn't complete. Try again.");
		expect((screen.getByLabelText('Organization name') as HTMLInputElement).value).toBe('Draft Name');
		expect(screen.queryByText('Organization name updated.')).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
	});

	it('keeps the typed custom path in place with an Alert when the save errors unexpectedly', async () => {
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await fireEvent.input(screen.getByLabelText('Custom path'), { target: { value: 'draft-path' } });
		enhancements.get('?/updateSlug')!({ cancel: () => {} });
		await tick();
		await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update URL' }));
		const page = { applyForm: (form: unknown) => view.rerender({ form: form as never }) };

		await callbacks.at(-1)!(
			frameworkOutcome({ type: 'error', status: 500, error: { message: 'Internal Error' } }, page)
		);
		await tick();

		const slugForm = screen.getByLabelText('Custom path').closest('form')!;
		expect(page).not.toHaveProperty('errorPage');
		within(slugForm).getByRole('alert');
		expect((screen.getByLabelText('Custom path') as HTMLInputElement).value).toBe('draft-path');
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Update URL' }));
	});

	it('confirms a saved custom URL and returns focus to the URL controls after its redirect', async () => {
		const view = render(Page, { data: data('a', null), form: null, params: { orgId: 'a' } });
		const navigateTo = (urlSlug: string | null) => ({
			applyForm: async () => {},
			navigate: () => view.rerender({ form: null, data: data('a', urlSlug) })
		});
		await fireEvent.input(screen.getByLabelText('Custom path'), { target: { value: 'new-path' } });
		enhancements.get('?/updateSlug')!({ cancel: () => {} });
		await tick();
		await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update URL' }));
		await callbacks.at(-1)!(
			frameworkOutcome(
				{ type: 'redirect', status: 303, location: '/org/new-path/settings/general' },
				navigateTo('new-path')
			)
		);
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Update URL' }));
		expect(toasts.at(-1)).toBe('Custom URL updated. Bookmarks and shared links using the old URL will need updating.');

		await fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset URL' }));
		await callbacks.at(-1)!(
			frameworkOutcome({ type: 'redirect', status: 303, location: '/org/a/settings/general' }, navigateTo(null))
		);
		expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Set URL' }));
		expect(toasts.at(-1)).toBe('Custom URL removed. The app path uses the Organization ID again.');
	});

	it('does not confirm a custom URL when the save redirects to sign-in', async () => {
		render(Page, { data: data('a', null), form: null, params: { orgId: 'a' } });
		await fireEvent.input(screen.getByLabelText('Custom path'), { target: { value: 'new-path' } });
		enhancements.get('?/updateSlug')!({ cancel: () => {} });
		await tick();
		await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update URL' }));
		await callbacks.at(-1)!(
			frameworkOutcome({ type: 'redirect', status: 303, location: '/auth/login' }, { applyForm: async () => {} })
		);
		expect(toasts).toEqual([]);
	});
});
