import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Personnel } from '../personnel.types';
import { personnelStore } from '../stores/personnel.svelte';
import { PersonnelRecordActions, type PersonnelRecordActionsDeps } from './personnelRecordActions.svelte';

const person: Personnel = {
	id: 'person-1',
	slug: 'rivera-monica',
	rank: 'SGT',
	lastName: 'Rivera',
	firstName: 'Monica',
	mos: '68W',
	clinicRole: 'Medic',
	ets: '2026-06-20',
	deros: null,
	groupId: 'group-1',
	groupName: 'Alpha',
	archivedAt: null
};

afterEach(() => vi.unstubAllGlobals());

function makeActions(deps: PersonnelRecordActionsDeps = {}) {
	return new PersonnelRecordActions(
		() => ({ orgId: 'org-1', orgUrlSegment: 'org-alpha', person, requestArchiveApproval: async () => false }),
		deps
	);
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((respond) => {
		resolve = respond;
	});
	return { promise, resolve };
}

describe('PersonnelRecordActions', () => {
	it('downloads the export under the server filename', async () => {
		const blob = new Blob(['records']);
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			headers: new Headers({ 'Content-Disposition': 'attachment; filename="rivera-records.xlsx"' }),
			blob: () => Promise.resolve(blob)
		});
		const downloadBlob = vi.fn();
		const actions = makeActions({ fetch: fetchMock as typeof fetch, downloadBlob });

		await actions.exportRecords();

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel/person-1/export');
		expect(downloadBlob).toHaveBeenCalledWith(blob, 'rivera-records.xlsx');
		expect(actions.exportError).toBe('');
	});

	it('shows why an export failed', async () => {
		const actions = makeActions({ fetch: vi.fn().mockResolvedValue(new Response(null, { status: 500 })) });

		await actions.exportRecords();

		expect(actions.exportError).toBe('Unable to export personnel records.');
		expect(actions.exporting).toBe(false);
	});

	it('returns to the roster with fresh data once the Person is archived', async () => {
		const goto = vi.fn();
		const actions = makeActions({ archivePersonnel: vi.fn(async () => 'archived' as const), goto });

		await actions.confirmArchive();

		expect(goto).toHaveBeenCalledWith('/org/org-alpha/personnel', { invalidate: ['app:personnel-data'] });
	});

	it.each([false, true])(
		'routes an archive requiring approval to the approver and stays on the record (acknowledged: %s)',
		async (accepted) => {
			personnelStore.load([], 'another-org');
			const fetchMock = vi.fn().mockResolvedValue(Response.json({ requiresApproval: true }, { status: 202 }));
			vi.stubGlobal('fetch', fetchMock);
			const requestArchiveApproval = vi.fn().mockResolvedValue(accepted);
			const goto = vi.fn();
			const actions = new PersonnelRecordActions(
				() => ({ orgId: 'org-1', orgUrlSegment: 'org-alpha', person, requestArchiveApproval }),
				{ goto }
			);
			actions.confirmingArchive = true;

			await actions.confirmArchive();

			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/personnel', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: 'person-1' })
			});
			expect(requestArchiveApproval).toHaveBeenCalledWith({
				orgId: 'org-1',
				personnelId: 'person-1',
				description: expect.any(String),
				resourceUrl: '/org/org-1/personnel/rivera-monica'
			});
			expect(personnelStore.items).toEqual([]);
			expect(actions.confirmingArchive).toBe(false);
			expect(actions.archiving).toBe(false);
			expect(goto).not.toHaveBeenCalled();
		}
	);

	it.each(['request', 'body'] as const)('does not download an export after disposal during its %s', async (stage) => {
		const request = deferred<Response>();
		const body = deferred<Blob>();
		const reading = deferred<void>();
		const response = new Response('records', {
			headers: { 'Content-Disposition': 'attachment; filename="old-person.xlsx"' }
		});
		vi.spyOn(response, 'blob').mockImplementation(() => {
			reading.resolve();
			return body.promise;
		});
		const downloadBlob = vi.fn();
		const actions = makeActions({ fetch: vi.fn(() => request.promise), downloadBlob });
		const running = actions.exportRecords();
		if (stage === 'body') {
			request.resolve(response);
			await reading.promise;
		}
		actions.dispose();
		request.resolve(response);
		body.resolve(new Blob(['records']));
		await running;
		expect(downloadBlob).not.toHaveBeenCalled();
	});

	it('does not navigate when an admitted archive completes after disposal', async () => {
		const result = deferred<'archived'>();
		const archivePersonnel = vi.fn(() => result.promise);
		const goto = vi.fn();
		const actions = makeActions({ archivePersonnel, goto });
		const running = actions.confirmArchive();
		expect(archivePersonnel).toHaveBeenCalled();
		actions.dispose();
		result.resolve('archived');
		await running;
		expect(goto).not.toHaveBeenCalled();
	});
});
