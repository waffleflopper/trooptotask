// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersonnelCounselingsRead, PersonnelDocumentsRead } from '$features/personnel/contracts';
import { createClientAccess } from '$lib/access/clientAccess';
import Page from './+page.svelte';

const shell = vi.hoisted(() => ({ role: 'owner' as 'owner' | 'member' }));

vi.mock('$features/app-shell', async (importOriginal) => ({
	...(await importOriginal<typeof import('$features/app-shell')>()),
	getAppShellContext: () => Object.assign(createClientAccess({ membershipRole: shell.role }), { orgId: 'org-1' })
}));
vi.mock('$app/state', () => ({ page: { state: {}, params: {} } }));
vi.mock('$app/navigation', () => ({
	afterNavigate: vi.fn(),
	goto: vi.fn(),
	invalidate: vi.fn(),
	replaceState: vi.fn()
}));

afterEach(() => {
	cleanup();
	shell.role = 'owner';
});

const emptyDocuments: PersonnelDocumentsRead = { records: [], total: 0, usedBytes: 0, capBytes: 25 * 1024 * 1024 };

function counselings(title: string): PersonnelCounselingsRead {
	return {
		records: [
			{
				id: `${title}-id`,
				personnelId: 'person-1',
				dateConducted: '2026-10-02',
				title,
				status: 'uploaded',
				conductedBy: null,
				uploadedBy: 'SSG Miller',
				fileName: 'a.pdf',
				createdAt: '2026-10-02T15:00:00.000Z',
				archivedAt: null
			}
		],
		total: 1,
		uploaderLabel: null,
		coveredMonths: ['2026-10'],
		lastConductedOn: '2026-10-02'
	};
}

function data(personId: string, read: Promise<PersonnelCounselingsRead>) {
	return {
		personnelDetailHeader: { person: { id: personId, rank: 'SGT', lastName: personId, groupId: null } },
		asOf: '2026-10-19',
		files: { counselings: read, documents: Promise.resolve(emptyDocuments) }
	} as unknown as ComponentProps<typeof Page>['data'];
}

describe('Files page', () => {
	it("drops the previous Person's rows while the next Person's reads are pending", async () => {
		const view = render(Page, { props: { data: data('person-1', Promise.resolve(counselings('Alpha counseling'))) } });
		await screen.findByText('Alpha counseling');

		await view.rerender({ data: data('person-2', new Promise(() => {})) });

		expect(screen.queryByText('Alpha counseling')).toBeNull();
		expect(screen.getByLabelText('Counselings').getAttribute('aria-busy')).toBe('true');
	});

	it('offers the dropzone to a role that manages records', async () => {
		render(Page, { props: { data: data('person-1', Promise.resolve(counselings('Alpha counseling'))) } });

		expect(await screen.findByLabelText(/Drop files to upload/)).toBeTruthy();
	});

	it('hides the dropzone and archive actions from a role that only reads', async () => {
		shell.role = 'member';
		render(Page, { props: { data: data('person-1', Promise.resolve(counselings('Alpha counseling'))) } });

		await screen.findByText('Alpha counseling');
		expect(screen.queryByLabelText(/Drop files to upload/)).toBeNull();
		expect(screen.queryByRole('button', { name: /^Archive / })).toBeNull();
	});
});
