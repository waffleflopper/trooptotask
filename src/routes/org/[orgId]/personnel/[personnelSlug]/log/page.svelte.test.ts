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

function pageData(personId: string, title: string) {
	const person = { id: personId, slug: personId, rank: 'SGT', lastName: personId, firstName: 'Test', archivedAt: null };
	const followUp = {
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
});
