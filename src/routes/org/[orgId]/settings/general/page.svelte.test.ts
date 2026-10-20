// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarCounts, LastRenamed } from '$features/organization/contracts';
import { frameworkOutcome } from '$lib/test-support/sveltekitEnhance';
import Page from './+page.svelte';

type Callback = (input: unknown) => Promise<void>;
interface Submission {
	action: string;
	name: string | null;
	callback?: Callback;
}

const { submissions, toasts } = vi.hoisted(() => ({
	submissions: [] as Submission[],
	toasts: [] as Array<{ message: string; action?: { label: string; onClick: () => void } }>
}));
vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: {
		success: (message: string, _duration?: number, action?: { label: string; onClick: () => void }) =>
			toasts.push({ message, action }),
		dismiss: () => undefined
	}
}));
vi.mock('$app/forms', () => ({
	enhance: (node: HTMLFormElement, submit: (input: { cancel: () => void; formData: FormData }) => unknown) => {
		const listener = (event: Event) => {
			event.preventDefault();
			const formData = new FormData(node);
			const callback = submit({ cancel: () => {}, formData });
			submissions.push({
				action: node.getAttribute('action')!,
				name: formData.get('name') as string | null,
				callback: typeof callback === 'function' ? (callback as Callback) : undefined
			});
		};
		node.addEventListener('submit', listener);
		return { destroy: () => node.removeEventListener('submit', listener) };
	}
}));

const COUNTS: CalendarCounts = { statusTypes: 6, assignmentTypes: 4, specialDays: 11 };

function data(
	orgId: string,
	{
		urlSlug = 'example-unit' as string | null,
		lastRenamed = null as Promise<LastRenamed | null> | null,
		calendarCounts = Promise.resolve(COUNTS)
	} = {}
) {
	return {
		orgId,
		orgName: 'Example Organization',
		generalSettings: {
			organization: { id: orgId, name: 'Example Organization', urlSlug, urlSegment: urlSlug ?? orgId },
			lastRenamed,
			calendarCounts
		}
	} as unknown as ComponentProps<typeof Page>['data'];
}

const sent = () => submissions.filter((submission) => submission.callback);
function lastCallback(): Callback {
	const callback = sent().at(-1)?.callback;
	if (!callback) throw new Error('No request was sent');
	return callback;
}

beforeEach(() => {
	submissions.length = 0;
	toasts.length = 0;
	vi.useFakeTimers();
});
afterEach(async () => {
	cleanup();
	await vi.runAllTimersAsync();
	vi.useRealTimers();
	vi.restoreAllMocks();
});

async function typeAndSaveName(name: string) {
	await fireEvent.click(screen.getByRole('button', { name: 'Edit unit name' }));
	await fireEvent.input(screen.getByLabelText('Unit name'), { target: { value: name } });
	await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

async function saveName(name: string) {
	await typeAndSaveName(name);
	return lastCallback();
}

async function confirmSlug(value: string) {
	await fireEvent.input(screen.getByLabelText('Web address'), { target: { value } });
	await fireEvent.submit(screen.getByLabelText('Web address').closest('form')!);
	await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Update address' }));
	return lastCallback();
}

const success = { result: { type: 'success', status: 200, data: { nameSuccess: true } }, update: async () => {} };

describe('General settings unit name', () => {
	it('saves a new name without asking first, and Undo writes the old name back through the same save', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });

		const save = await saveName('C Co, 526th BSB');

		expect(screen.queryByRole('dialog')).toBeNull();
		expect(sent().map(({ action, name }) => [action, name])).toEqual([['?/updateName', 'C Co, 526th BSB']]);
		await save(success);
		expect(toasts.map(({ message, action }) => [message, action?.label])).toEqual([
			['Unit name changed to C Co, 526th BSB.', 'Undo']
		]);

		toasts[0].action!.onClick();
		await tick();
		await tick();

		expect(sent().map(({ action, name }) => [action, name])).toEqual([
			['?/updateName', 'C Co, 526th BSB'],
			['?/updateName', 'Example Organization']
		]);
		await lastCallback()(success);
		expect(toasts.map(({ message, action }) => [message, action?.label])).toEqual([
			['Unit name changed to C Co, 526th BSB.', 'Undo'],
			['Unit name changed back to Example Organization.', undefined]
		]);
	});

	it('offers no Undo for a rejected rename', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });

		const save = await saveName('Taken Name');
		await save({ result: { type: 'failure', status: 400, data: { error: 'Name is taken' } }, update: async () => {} });

		expect(toasts).toEqual([]);
	});

	it('closes the editor without a request when the name did not change', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });

		await typeAndSaveName('Example Organization');
		await tick();

		expect(sent()).toEqual([]);
		expect(screen.queryByLabelText('Unit name')).toBeNull();
	});

	it('sends no undo once the unit changes', async () => {
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await (
			await saveName('C Co, 526th BSB')
		)(success);
		await view.rerender({ data: data('b'), form: null });

		toasts[0].action!.onClick();
		await tick();
		await tick();

		expect(sent()).toHaveLength(1);
	});

	it('keeps focus on Save while the name saves and ignores a second submission', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await saveName('Pending Name');
		const save = screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement;
		save.focus();

		await fireEvent.click(save);

		expect(sent()).toHaveLength(1);
		expect(save.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(save);
	});

	it('moves focus into the name editor and back to its Edit button on cancel', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Edit unit name' }));
		await tick();
		expect(document.activeElement).toBe(screen.getByLabelText('Unit name'));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await tick();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Edit unit name' }));
	});

	it('associates a rejected name with its field and focuses it', async () => {
		render(Page, { data: data('a'), form: { error: 'Name is taken' }, params: { orgId: 'a' } });
		await tick();
		const name = screen.getByLabelText('Unit name');
		expect(name.getAttribute('aria-invalid')).toBe('true');
		expect(document.getElementById(name.getAttribute('aria-describedby') ?? '')?.textContent?.trim()).toBe(
			'Name is taken'
		);
		expect(document.activeElement).toBe(name);
	});

	it('keeps the typed name in place with an Alert when the save errors unexpectedly', async () => {
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		const save = await saveName('Draft Name');
		const page = { applyForm: (form: unknown) => view.rerender({ form: form as never }) };

		await save(frameworkOutcome({ type: 'error', status: 500, error: { message: 'Internal Error' } }, page));
		await tick();

		const nameForm = screen.getByLabelText('Unit name').closest('form')!;
		expect(page).not.toHaveProperty('errorPage');
		expect(within(nameForm).getByRole('alert').textContent?.trim()).toBe("The request didn't complete. Try again.");
		expect((screen.getByLabelText('Unit name') as HTMLInputElement).value).toBe('Draft Name');
		expect(toasts).toEqual([]);
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));
	});

	it('ignores a disposed name response after A → B → A', async () => {
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		const oldSave = await saveName('Old Request');
		await view.rerender({ data: data('b'), form: null });
		await view.rerender({ data: data('a'), form: null });
		const newSave = await saveName('New Request');
		const update = vi.fn();

		await oldSave({ result: { type: 'success', status: 200, data: { nameSuccess: true } }, update });

		expect(update).not.toHaveBeenCalled();
		expect(toasts).toEqual([]);
		expect(screen.getByRole('button', { name: 'Saving...' })).toBeTruthy();
		await newSave({ result: { type: 'success', status: 200, data: { nameSuccess: true } }, update });
		expect(update).toHaveBeenCalledOnce();
		expect(toasts.map(({ message }) => message)).toEqual(['Unit name changed to New Request.']);
	});
});

describe('General settings last change', () => {
	it('shows owners the date and actor of the latest rename', async () => {
		render(Page, {
			data: data('a', {
				lastRenamed: Promise.resolve({ at: '2026-03-14T12:00:00.000Z', actor: 'whitaker@example.com' })
			}),
			form: null,
			params: { orgId: 'a' }
		});
		await vi.runAllTimersAsync();

		expect(screen.getByText('Last changed 14 Mar 2026 · whitaker@example.com')).toBeTruthy();
	});

	it('holds a loading line while the last change streams', () => {
		render(Page, { data: data('a', { lastRenamed: new Promise(() => {}) }), form: null, params: { orgId: 'a' } });

		expect(screen.getByText('Loading the last change')).toBeTruthy();
	});

	it('shows admins nothing in that slot', async () => {
		render(Page, { data: data('a', { lastRenamed: null }), form: null, params: { orgId: 'a' } });
		await vi.runAllTimersAsync();

		expect(screen.queryByText(/Last changed/)).toBeNull();
		expect(screen.queryByText('Loading the last change')).toBeNull();
	});
});

describe('General settings web address', () => {
	const warning = () => screen.queryByText(/Changing it breaks saved bookmarks and shared links to/);

	it('warns in amber about bookmarks once the typed path differs from the saved one', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		expect(warning()).toBeNull();

		await fireEvent.input(screen.getByLabelText('Web address'), { target: { value: 'c-co-526' } });

		expect(warning()?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
			'Changing it breaks saved bookmarks and shared links to /org/example-unit. Tell the unit before you switch.'
		);
		expect(warning()?.closest('[data-slot="alert"]')?.id).toBe('url-slug-warning');
		expect(screen.getByLabelText('Web address').getAttribute('aria-describedby')).toContain('url-slug-warning');

		await fireEvent.input(screen.getByLabelText('Web address'), { target: { value: ' Example-Unit ' } });
		expect(warning()).toBeNull();
	});

	it('does not warn when the unit has no custom path, since its default address keeps working', async () => {
		render(Page, { data: data('a', { urlSlug: null }), form: null, params: { orgId: 'a' } });

		await fireEvent.input(screen.getByLabelText('Web address'), { target: { value: 'new-path' } });

		expect(warning()).toBeNull();
		expect(screen.getByText('Default /org/a')).toBeTruthy();
	});

	it('still confirms an update and a reset', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await fireEvent.submit(screen.getByLabelText('Web address').closest('form')!);
		expect(screen.getByRole('dialog', { name: 'Update the web address?' })).toBeTruthy();
		expect(sent()).toEqual([]);
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		await fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
		expect(screen.getByRole('dialog', { name: 'Reset the web address?' })).toBeTruthy();
		expect(sent()).toEqual([]);
	});

	it('keeps focus on Update while the address saves and ignores a second submission or a Reset', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await confirmSlug('held-path');
		const save = screen.getByRole('button', { name: 'Saving...' }) as HTMLButtonElement;
		const reset = screen.getByRole('button', { name: 'Reset to default' }) as HTMLButtonElement;
		save.focus();

		await fireEvent.click(save);
		await fireEvent.click(reset);

		expect(sent()).toHaveLength(1);
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(save.getAttribute('aria-disabled')).toBe('true');
		expect(reset.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(save);
	});

	it('associates a rejected path with its field and focuses it', async () => {
		render(Page, { data: data('a'), form: { slugError: 'Choose another URL' }, params: { orgId: 'a' } });
		await tick();
		const slug = screen.getByLabelText('Web address');
		expect(slug.getAttribute('aria-invalid')).toBe('true');
		const descriptions = (slug.getAttribute('aria-describedby') ?? '')
			.split(' ')
			.map((id) => document.getElementById(id)?.textContent?.trim());
		expect(descriptions).toContain('Choose another URL');
		expect(document.activeElement).toBe(slug);
	});

	it('keeps the typed path in place with an Alert when the save errors unexpectedly', async () => {
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		const save = await confirmSlug('draft-path');
		const page = { applyForm: (form: unknown) => view.rerender({ form: form as never }) };

		await save(frameworkOutcome({ type: 'error', status: 500, error: { message: 'Internal Error' } }, page));
		await tick();

		const slugForm = screen.getByLabelText('Web address').closest('form')!;
		expect(within(slugForm).getByRole('alert').textContent?.trim()).toBe("The request didn't complete. Try again.");
		expect((screen.getByLabelText('Web address') as HTMLInputElement).value).toBe('draft-path');
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Update' }));
	});

	it('confirms a saved address and a reset after their redirects', async () => {
		const view = render(Page, { data: data('a', { urlSlug: null }), form: null, params: { orgId: 'a' } });
		const navigateTo = (urlSlug: string | null) => ({
			applyForm: async () => {},
			navigate: () => view.rerender({ form: null, data: data('a', { urlSlug }) })
		});

		await (
			await confirmSlug('new-path')
		)(
			frameworkOutcome(
				{ type: 'redirect', status: 303, location: '/org/new-path/settings/general' },
				navigateTo('new-path')
			)
		);
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Update' }));
		expect(toasts.at(-1)?.message).toBe(
			'Web address updated. Bookmarks and shared links to the old address need updating.'
		);
		expect(warning()).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset address' }));
		expect(sent().at(-1)?.action).toBe('?/clearSlug');
		await lastCallback()(
			frameworkOutcome({ type: 'redirect', status: 303, location: '/org/a/settings/general' }, navigateTo(null))
		);
		expect(screen.queryByRole('button', { name: 'Reset to default' })).toBeNull();
		expect((screen.getByLabelText('Web address') as HTMLInputElement).value).toBe('');
		expect(toasts.at(-1)?.message).toBe('Web address reset. The unit uses its default address again.');
	});

	it('discards a disposed reset response and keeps the next unit on update', async () => {
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Reset address' }));
		const oldReset = lastCallback();
		await view.rerender({ data: data('b'), form: null });
		const update = vi.fn();

		await oldReset({ result: { type: 'redirect', status: 303, location: '/org/a/settings/general' }, update });

		expect(update).not.toHaveBeenCalled();
		expect(toasts).toEqual([]);
		expect(screen.getByLabelText('Web address').closest('form')!.getAttribute('action')).toBe('?/updateSlug');
	});
});

describe('General settings Calendar signpost', () => {
	it('shows the live Calendar counts and links to Calendar settings', async () => {
		render(Page, { data: data('a'), form: null, params: { orgId: 'a' } });
		await vi.runAllTimersAsync();

		expect(screen.getByText('6 statuses · 4 assignment types · 11 holidays')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Calendar settings' }).getAttribute('href')).toBe(
			'/org/example-unit/calendar/settings'
		);
	});

	it('uses the singular for a count of one', async () => {
		render(Page, {
			data: data('a', { calendarCounts: Promise.resolve({ statusTypes: 1, assignmentTypes: 1, specialDays: 1 }) }),
			form: null,
			params: { orgId: 'a' }
		});
		await vi.runAllTimersAsync();

		expect(screen.getByText('1 status · 1 assignment type · 1 holiday')).toBeTruthy();
	});

	it('holds a loading line while the counts stream and says so when they fail', async () => {
		let fail!: (error: Error) => void;
		const calendarCounts = new Promise<CalendarCounts>((_, reject) => (fail = reject));
		render(Page, { data: data('a', { calendarCounts }), form: null, params: { orgId: 'a' } });
		expect(screen.getByText('Loading Calendar counts')).toBeTruthy();

		fail(new Error('count failed'));
		await vi.runAllTimersAsync();

		expect(screen.getByText('Calendar counts could not be loaded.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Calendar settings' })).toBeTruthy();
	});
});
