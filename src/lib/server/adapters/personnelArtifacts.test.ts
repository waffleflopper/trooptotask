import { createSupabaseOrganizationSettingsReader } from '$features/organization/index.server';
import { createPersonnelArtifactDeliveryContext } from './requestContexts.server';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
	createSupabasePersonnelRecordPersistence,
	listPersonnelCounselingRecords,
	listPersonnelDocuments,
	listPersonnelFollowUps,
	createPersonnelDocument
} from '$features/personnel/index.server';
import { createTestContext } from './inMemory';
import { createSupabasePersonnelArtifactReadPersistence } from '$features/personnel/index.server';

const ORG = 'd130b000-0000-4000-8000-000000000001';
const PERSON = 'd130a000-0000-4000-8000-000000000001';
const families = [
	{ table: 'counseling_records', list: listPersonnelCounselingRecords, label: 'uploadedBy' },
	{ table: 'personnel_documents', list: listPersonnelDocuments, label: 'uploadedBy' },
	{ table: 'personnel_follow_ups', list: listPersonnelFollowUps, label: 'createdBy' }
] as const;

/** Real SDK serialization against a finite provider model; no live SQL/RLS claims. */
function fixture(family: (typeof families)[number], failure?: 'artifact-page' | 'label-page') {
	const rows = Array.from({ length: 1001 }, (_, index) => ({
		id: `artifact-${String(index).padStart(4, '0')}`,
		organization_id: ORG,
		personnel_id: PERSON,
		title: `Observation ${index}`,
		date_conducted: '2026-10-01',
		created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
		updated_at: '2026-10-01T12:00:00.123456Z',
		file_path: `${ORG}/personnel/${PERSON}/documents/${index}-synthetic.pdf`,
		file_size_bytes: 3187,
		content_type: 'application/pdf',
		uploaded_by: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
		created_by: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
		status: 'open' as const,
		notes: null,
		due_date: null,
		completed_at: null,
		archived_at: null
	}));
	const receipts: {
		table: string;
		urlBytes: number;
		status: number;
		offset?: number;
		ids?: string[];
		query?: URLSearchParams;
	}[] = [];
	let labelCalls = 0;
	const client = createClient('http://artifacts.invalid', 'synthetic-key', {
		auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
		global: {
			fetch: async (input) => {
				const url = new URL(String(input));
				expect(url.origin).toBe('http://artifacts.invalid');
				const table = url.pathname.split('/').pop()!;
				const receipt: (typeof receipts)[number] = {
					table,
					urlBytes: Buffer.byteLength(url.href),
					status: 200,
					query: url.searchParams
				};
				receipts.push(receipt);
				const reject = (status: number, message: string) => {
					receipt.status = status;
					return Response.json({ message }, { status });
				};
				if (receipt.urlBytes > 8192) return reject(414, 'URI too long');
				expect(url.searchParams.get('organization_id')).toBe(`eq.${ORG}`);
				if (table === 'personnel') {
					expect(url.searchParams.get('id')).toBe(`eq.${PERSON}`);
					return Response.json({ id: PERSON, group_id: null });
				}
				if (table === family.table) {
					expect(url.searchParams.get('personnel_id')).toBe(`eq.${PERSON}`);
					if (table === 'personnel_follow_ups') expect(url.searchParams.get('status')).toBe('not.in.(archived)');
					else expect(url.searchParams.get('archived_at')).toBe('is.null');
					const offset = Number(url.searchParams.get('offset') ?? 0);
					receipt.offset = offset;
					if (failure === 'artifact-page' && offset > 0) return reject(400, 'Later artifact page unavailable');
					return Response.json(
						[...rows].reverse().slice(offset, offset + Math.min(1000, Number(url.searchParams.get('limit') ?? 1000)))
					);
				}
				if (table === 'organization_memberships') {
					const ids = url.searchParams.get('user_id')!.slice(4, -1).split(',');
					receipt.ids = ids;
					labelCalls++;
					if (failure === 'label-page' && labelCalls > 1) return reject(400, 'Later contributor page unavailable');
					return Response.json(
						rows
							.filter((row) => ids.includes(row.uploaded_by))
							.map((row) => ({
								user_id: row.uploaded_by,
								display_name: row.title.replace('Observation', 'Leader')
							}))
							.slice(0, 1000)
					);
				}
				throw new Error(`Unexpected provider table ${table}`);
			}
		}
	});
	const ctx = createTestContext({ auth: { orgId: ORG } });
	const artifactReads = createSupabasePersonnelArtifactReadPersistence(client, ORG);
	return {
		ctx: {
			...ctx,
			artifactReads,
			organizationPersonnel: createSupabasePersonnelRecordPersistence(client, ORG),
			organizationSettings: createSupabaseOrganizationSettingsReader(client)
		},
		rows,
		receipts
	};
}

describe('Personnel artifact provider delivery', () => {
	it.each(families)(
		'returns all 1,001 $table rows and Organization contributor labels within provider limits',
		async (family) => {
			const run = fixture(family);
			const actual = await family.list(createPersonnelArtifactDeliveryContext(run.ctx), PERSON);
			expect(actual.map((row) => row.id)).toEqual(
				Array.from({ length: 1001 }, (_, i) => `artifact-${String(1000 - i).padStart(4, '0')}`)
			);
			expect(actual[0]).toMatchObject({ [family.label]: 'Leader 1000' });
			expect(actual[1000]).toMatchObject({ [family.label]: 'Leader 0' });
			expect(run.receipts.filter((receipt) => receipt.table === family.table).map((receipt) => receipt.offset)).toEqual(
				[0, 1000]
			);
			expect(run.receipts.every((receipt) => receipt.status === 200 && receipt.urlBytes <= 8192)).toBe(true);
		}
	);

	it.each(families.slice(0, 2))('reads an offset page of $table rows', async (family) => {
		const run = fixture(family);
		const page = await family.list(createPersonnelArtifactDeliveryContext(run.ctx), PERSON, 3, { offset: 2 });
		expect(page.map((row) => row.id)).toEqual(['artifact-0998', 'artifact-0997', 'artifact-0996']);
		expect(run.receipts.filter((receipt) => receipt.table === family.table).map((receipt) => receipt.offset)).toEqual([
			2
		]);
	});

	it('sums every active document and lists every counseling date past one provider page', async () => {
		const documents = fixture(families[1]);
		await expect(documents.ctx.artifactReads.summarizeActiveDocuments(PERSON)).resolves.toEqual({
			count: 1001,
			bytes: 1001 * 3187
		});
		const counselings = fixture(families[0]);
		const dates = await counselings.ctx.artifactReads.listActiveCounselingDates(PERSON, '2025-11-01');
		expect(dates).toHaveLength(1001);
		expect(new Set(dates)).toEqual(new Set(['2026-10-01']));
		expect(
			counselings.receipts.filter((receipt) => receipt.table === 'counseling_records').map((receipt) => receipt.offset)
		).toEqual([0, 1000]);
	});

	it('asks the provider for the newest active counseling on or before the day, one row', async () => {
		const run = fixture(families[0]);
		const rows = await run.ctx.artifactReads.listCounselingRecords(PERSON, {
			archived: false,
			limit: 1,
			onOrBefore: '2026-10-19'
		});
		expect(rows.map((row) => row.date_conducted)).toEqual(['2026-10-01']);
		const [request] = run.receipts.filter((receipt) => receipt.table === 'counseling_records');
		expect(request.query?.get('archived_at')).toBe('is.null');
		expect(request.query?.get('date_conducted')).toBe('lte.2026-10-19');
		expect(request.query?.get('order')).toMatch(/^date_conducted\.desc/);
		expect(request.query?.get('limit')).toBe('1');
	});

	it('propagates a later artifact-page failure instead of returning partial history', async () => {
		const run = fixture(families[1], 'artifact-page');
		await expect(families[1].list(createPersonnelArtifactDeliveryContext(run.ctx), PERSON)).rejects.toThrow(
			'Later artifact page unavailable'
		);
		expect(run.receipts.some((receipt) => receipt.table === 'organization_memberships')).toBe(false);
	});

	it('propagates a later contributor failure instead of returning partly hydrated history', async () => {
		const run = fixture(families[1], 'label-page');
		await expect(families[1].list(createPersonnelArtifactDeliveryContext(run.ctx), PERSON)).rejects.toThrow(
			'Later contributor page unavailable'
		);
	});

	it.each([0, null, 'failure'] as const)(
		'reads only the admitted Organization cap through the request SDK (%s)',
		async (cap) => {
			const ctx = createTestContext({ auth: { orgId: ORG } });
			ctx.store.seed('personnel', [{ id: PERSON, organization_id: ORG, group_id: null }]);
			const client = createClient('http://artifact-settings.invalid', 'synthetic-key', {
				auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
				global: {
					fetch: async (input) => {
						const url = new URL(String(input));
						expect(url.origin).toBe('http://artifact-settings.invalid');
						expect(url.pathname).toBe('/rest/v1/organizations');
						expect(url.searchParams.get('id')).toBe(`eq.${ORG}`);
						expect(url.searchParams.get('select')).toBe('personnel_document_storage_cap_bytes');
						return cap === 'failure'
							? Response.json({ message: 'Settings read unavailable' }, { status: 400 })
							: Response.json({ personnel_document_storage_cap_bytes: cap });
					}
				}
			});
			const context = createPersonnelArtifactDeliveryContext({
				...ctx,
				organizationSettings: createSupabaseOrganizationSettingsReader(client)
			});
			const create = createPersonnelDocument(context, {
				personnelId: PERSON,
				file: new File(['%PDF-1.7'], 'signed.pdf', { type: 'application/pdf' })
			});
			if (cap === 'failure') await expect(create).rejects.toThrow('Settings read unavailable');
			else if (cap === 0) await expect(create).rejects.toMatchObject({ status: 409 });
			else await expect(create).resolves.toMatchObject({ personnelId: PERSON, fileSizeBytes: 8 });
			expect(ctx.storagePort.files).toHaveLength(cap === null ? 1 : 0);
			expect(await ctx.rawStore.findMany('personnel_documents', ORG)).toHaveLength(cap === null ? 1 : 0);
		}
	);
});
