// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelFollowUp } from '$features/personnel/contracts';
import PersonnelFollowUpsPageView from './PersonnelFollowUpsPageView.svelte';

const record: PersonnelFollowUp = {
	id: 'follow-up-1',
	personnelId: 'person-1',
	title: 'Complete BLC packet',
	notes: '',
	dueDate: null,
	status: 'open',
	createdBy: 'leader-1',
	createdAt: '2026-05-01T10:00:00Z',
	updatedAt: '2026-05-01T10:00:00Z',
	completedAt: null
};

function renderView() {
	return render(PersonnelFollowUpsPageView, {
		props: {
			data: {
				orgId: 'org-1',
				personnelId: 'person-1',
				title: 'Follow-ups',
				emptyState: 'No follow-ups.',
				records: [record]
			}
		}
	});
}

async function saveEditedTitle(title: string) {
	await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
	await fireEvent.input(screen.getByLabelText('Follow-up title'), { target: { value: title } });
	await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('PersonnelFollowUpsPageView', () => {
	it('shows the server reason when an edit is refused and keeps the edit open', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ message: 'This follow-up was archived.' }, { status: 404 }))
		);
		renderView();

		await saveEditedTitle('Complete BLC packet by Friday');

		expect(await screen.findByText('This follow-up was archived.')).toBeTruthy();
		expect((screen.getByLabelText('Follow-up title') as HTMLInputElement).value).toBe('Complete BLC packet by Friday');
		expect(screen.getByRole('button', { name: 'Cancel edit' })).toBeTruthy();
	});

	it('keeps the generic message when the edit fails on the server', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ message: 'relation missing' }, { status: 500 })));
		renderView();

		await saveEditedTitle('Complete BLC packet by Friday');

		expect(await screen.findByText('Unable to update follow-up.')).toBeTruthy();
		expect(screen.queryByText('relation missing')).toBeNull();
	});

	it('shows the server reason when completing a follow-up is refused', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ message: 'This follow-up was archived.' }, { status: 409 }))
		);
		renderView();

		await fireEvent.click(screen.getByRole('button', { name: 'Complete' }));

		expect(await screen.findByText('This follow-up was archived.')).toBeTruthy();
	});
});
