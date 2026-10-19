// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

vi.mock('$features/app-shell', () => ({ getAppShellContext: () => ({ orgId: 'org-1' }) }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/org/org-1/personnel/a/log') } }));
vi.mock('$app/navigation', () => ({ invalidate: vi.fn().mockResolvedValue(undefined), goto: vi.fn() }));

function jsonResponse(body: unknown) {
	return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function followUpFor(personId: string, title: string) {
	return {
		id: `f-${personId}`,
		personnelId: personId,
		title,
		notes: '',
		dueDate: null,
		status: 'open',
		createdBy: '1SG Ramos',
		createdAt: '2026-10-01T12:00:00.000Z',
		updatedAt: '2026-10-01T12:00:00.000Z',
		completedAt: null,
		completedBy: null,
		archivedAt: null,
		archivedBy: null
	};
}

function pageData(personId: string, title: string) {
	const person = { id: personId, slug: personId, rank: 'SGT', lastName: personId, firstName: 'Test', archivedAt: null };
	const followUp = followUpFor(personId, title);
	return {
		personnelDetailHeader: { person },
		today: '2026-10-19',
		followUps: Promise.resolve([followUp]),
		notes: Promise.resolve({ notes: [], total: 0 })
	} as never;
}

function deferredFetch() {
	const settlers: Array<(response: Response) => void> = [];
	const requests: string[] = [];
	vi.stubGlobal(
		'fetch',
		vi.fn((input: RequestInfo | URL) => {
			requests.push(String(input));
			return new Promise<Response>((resolve) => settlers.push(resolve));
		})
	);
	return { requests, settle: (index: number, response: Response) => settlers[index](response) };
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('Log page when the Soldier changes during a write', () => {
	it('does not touch the next Soldier’s draft or adopt the earlier Soldier’s late save', async () => {
		const held = deferredFetch();
		const view = render(Page, { props: { data: pageData('person-a', 'A follow-up') } });
		await fireEvent.click(await screen.findByRole('button', { name: 'A follow-up' }));
		const editor = screen.getByRole('form', { name: 'Edit follow-up A follow-up' });
		await fireEvent.input(editor.querySelector('input') as HTMLInputElement, { target: { value: 'A saved edit' } });
		await fireEvent.submit(editor);

		await view.rerender({ data: pageData('person-b', 'B follow-up') });
		await fireEvent.click(await screen.findByRole('button', { name: 'B follow-up' }));
		const nextEditor = screen.getByRole('form', { name: 'Edit follow-up B follow-up' });
		const draft = within(nextEditor).getByLabelText('Follow-up title') as HTMLInputElement;
		await fireEvent.input(draft, { target: { value: 'B unsaved draft' } });
		held.settle(0, jsonResponse({ title: 'A saved edit' }));

		await waitFor(() => expect(held.requests).toHaveLength(1));
		expect(held.requests[0]).toBe('/org/org-1/api/personnel/person-a/follow-ups/f-person-a');
		await new Promise((resolve) => setTimeout(resolve));
		expect(
			(
				within(screen.getByRole('form', { name: 'Edit follow-up B follow-up' })).getByLabelText(
					'Follow-up title'
				) as HTMLInputElement
			).value
		).toBe('B unsaved draft');
		expect(screen.queryByText('A saved edit')).toBeNull();
		expect(screen.queryByRole('button', { name: 'B follow-up' })).toBeNull();
	});

	it('keeps the next Soldier’s completion pending when the earlier completion finishes', async () => {
		const held = deferredFetch();
		const view = render(Page, { props: { data: pageData('person-a', 'A follow-up') } });
		await fireEvent.click(await screen.findByRole('checkbox', { name: 'Complete A follow-up' }));

		await view.rerender({ data: pageData('person-b', 'B follow-up') });
		const checkbox = await screen.findByRole('checkbox', { name: 'Complete B follow-up' });
		await fireEvent.click(checkbox);
		expect(held.requests).toEqual([
			'/org/org-1/api/personnel/person-a/follow-ups/f-person-a',
			'/org/org-1/api/personnel/person-b/follow-ups/f-person-b'
		]);
		held.settle(0, jsonResponse({ status: 'completed' }));

		await waitFor(() =>
			expect((screen.getByRole('checkbox', { name: 'Reopen B follow-up' }) as HTMLButtonElement).disabled).toBe(true)
		);
		held.settle(1, jsonResponse({ status: 'completed' }));
		await waitFor(() =>
			expect((screen.getByRole('checkbox', { name: 'Reopen B follow-up' }) as HTMLButtonElement).disabled).toBe(false)
		);
		expect(screen.queryByText('A follow-up')).toBeNull();
	});

	it('does not show the earlier Soldier’s new follow-up and note on the next Soldier, or disturb the next Soldier’s drafts', async () => {
		const held = deferredFetch();
		const view = render(Page, { props: { data: pageData('person-a', 'A follow-up') } });
		const followUpInput = await screen.findByLabelText('Follow-up title');
		await fireEvent.input(followUpInput, { target: { value: 'A new follow-up' } });
		await fireEvent.submit(followUpInput.closest('form') as HTMLFormElement);
		const composer = screen.getByLabelText('New leader note');
		await fireEvent.input(composer, { target: { value: 'A new note' } });
		await fireEvent.submit(composer.closest('form') as HTMLFormElement);
		await waitFor(() => expect(held.requests).toHaveLength(2));

		await view.rerender({ data: pageData('person-b', 'B follow-up') });
		await fireEvent.input(await screen.findByLabelText('Follow-up title'), { target: { value: 'B draft follow-up' } });
		await fireEvent.input(screen.getByLabelText('New leader note'), { target: { value: 'B draft note' } });
		held.settle(
			held.requests.indexOf('/org/org-1/api/personnel/person-a/follow-ups'),
			jsonResponse({ ...followUpFor('person-a', 'A new follow-up'), id: 'f-new-a' })
		);
		held.settle(
			held.requests.indexOf('/org/org-1/api/personnel/person-a/leader-notes'),
			jsonResponse({
				id: 'n-new-a',
				personnelId: 'person-a',
				author: '1SG Ramos',
				text: 'A new note',
				createdAt: '2026-10-19T12:00:00.000Z',
				archivedAt: null,
				archivedBy: null
			})
		);
		await new Promise((resolve) => setTimeout(resolve));

		expect(screen.queryByText('A new follow-up')).toBeNull();
		expect(screen.queryByText('A new note')).toBeNull();
		expect((screen.getByLabelText('Follow-up title') as HTMLInputElement).value).toBe('B draft follow-up');
		expect((screen.getByLabelText('New leader note') as HTMLTextAreaElement).value).toBe('B draft note');
		expect(screen.getByRole('button', { name: 'B follow-up' })).toBeTruthy();
	});
});
