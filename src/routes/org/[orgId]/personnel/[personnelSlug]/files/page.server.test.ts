import { createTestContext } from '$lib/server/adapters/inMemory';
import { createRequestPersonnelDetailContext } from '$lib/server/adapters/requestContexts.server';
import { testPersonnelArtifactsContext } from '$features/personnel/personnelArtifacts.testHelper';
import { VIEWER_TIME_ZONE_COOKIE } from '$lib/utils/viewerTimeZone';
import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelFilesPageLoad } from './+page.server';

function counseling(id: string, dateConducted: string, archivedAt: string | null = null) {
	return {
		id,
		organization_id: 'org-1',
		personnel_id: 'person-1',
		date_conducted: dateConducted,
		title: `Counseling ${id}`,
		summary: null,
		conducted_by: null,
		uploaded_by: 'test-user',
		file_path: `org-1/personnel/person-1/counseling-records/${id}.pdf`,
		created_at: `${dateConducted}T10:00:00Z`,
		archived_at: archivedAt
	};
}

function document(id: string, sizeBytes: number, archivedAt: string | null = null) {
	return {
		id,
		organization_id: 'org-1',
		personnel_id: 'person-1',
		title: `Document ${id}`,
		file_path: `org-1/personnel/person-1/documents/${id}.pdf`,
		file_size_bytes: sizeBytes,
		content_type: 'application/pdf',
		uploaded_by: 'test-user',
		created_at: '2026-10-01T10:00:00Z',
		archived_at: archivedAt
	};
}

function run(timeZone = 'UTC') {
	const ctx = createTestContext({ auth: { orgId: 'org-1' } });
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'org-1', slug: 'rivera-monica', group_id: null }]);
	ctx.store.seed('counseling_records', [
		counseling('c1', '2026-10-02'),
		counseling('c2', '2026-08-14'),
		counseling('c3', '2026-06-01'),
		counseling('c4', '2025-12-20'),
		counseling('c5', '2025-01-05'),
		counseling('c6', '2026-09-09', '2026-09-10T00:00:00Z')
	]);
	ctx.store.seed('personnel_documents', [
		document('d1', 1000),
		document('d2', 2000),
		document('d3', 3000),
		document('d4', 4000),
		document('d5', 90000, '2026-09-10T00:00:00Z')
	]);
	const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) =>
		config.fn(config.context === createRequestPersonnelDetailContext ? ctx : testPersonnelArtifactsContext(ctx))
	);
	const depends = vi.fn();
	const load = _createPersonnelFilesPageLoad({ loadWithContext });
	const result = () =>
		load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: { get: (name: string) => (name === VIEWER_TIME_ZONE_COOKIE ? timeZone : undefined) } as never,
			depends
		} as never);
	return { result, depends, loadWithContext };
}

describe('personnel files page server load', () => {
	it('streams the newest counselings with the active total and the months covered in the last twelve', async () => {
		const { counselings } = (await run().result()).files;

		const page = await counselings;
		expect(page.records.map((record) => record.id)).toEqual(['c1', 'c2', 'c3']);
		expect(page.total).toBe(5);
		expect(page.coveredMonths).toEqual(['2026-10', '2026-08', '2026-06', '2025-12']);
	});

	it('streams the newest documents with the active total, bytes in use and the storage cap', async () => {
		const { documents } = (await run().result()).files;

		const page = await documents;
		expect(page.records).toHaveLength(3);
		expect(page.total).toBe(4);
		expect(page.usedBytes).toBe(10000);
		expect(page.capBytes).toBeGreaterThan(page.usedBytes);
	});

	it('anchors the coverage window on the viewer day rather than the server day', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		try {
			vi.setSystemTime(new Date('2026-11-01T02:00:00Z'));
			const utc = await run('UTC').result();
			const newYork = await run('America/New_York').result();

			expect(utc.asOf).toBe('2026-11-01');
			expect(newYork.asOf).toBe('2026-10-31');
		} finally {
			vi.useRealTimers();
		}
	});

	it('registers the Files dependency so a write can refresh only these reads', async () => {
		const { result, depends } = run();
		await result();

		expect(depends).toHaveBeenCalledWith('app:personnel-detail-files');
	});
});
