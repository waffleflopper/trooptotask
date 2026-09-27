import { describe, expect, it } from 'vitest';
import type { DataStore } from '../ports';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { createSupabasePersonnelOrganizationExportPort } from '$features/personnel/index.server';
import { buildOrganizationDataExportWorkbook } from './organizationExportWorkbook';
import {
	loadOrganizationExportPayload,
	ORGANIZATION_EXPORT_QUERY_BATCH_SIZE,
	ORGANIZATION_EXPORT_SECTIONS
} from './organizationExport';

describe('organization export inventory', () => {
	it('keeps section keys unique and separate from export metadata keys', () => {
		const reservedPayloadKeys = new Set(['exportedAt', 'organizationId', 'sectionInventory', 'sections']);
		const keys = ORGANIZATION_EXPORT_SECTIONS.map((section) => section.key);

		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.filter((key) => reservedPayloadKeys.has(key))).toEqual([]);
	});

	it('caps concurrent organization table reads while building the export payload', async () => {
		let activeReads = 0;
		let maxActiveReads = 0;
		let calls = 0;
		const store = {
			async findMany(table: string) {
				calls += 1;
				activeReads += 1;
				maxActiveReads = Math.max(maxActiveReads, activeReads);
				await new Promise((resolve) => setTimeout(resolve, 0));
				activeReads -= 1;
				return [{ table }];
			}
		} as Pick<DataStore, 'findMany'> as DataStore;

		const payload = await loadOrganizationExportPayload(store, createTestAuthContext({ orgId: 'org-1' }), {
			listRows: (actor, table) => store.findMany(table, actor.orgId)
		});

		expect(calls).toBe(ORGANIZATION_EXPORT_SECTIONS.length);
		expect(maxActiveReads).toBeLessThanOrEqual(ORGANIZATION_EXPORT_QUERY_BATCH_SIZE);
		expect(payload.sectionInventory.length).toBe(ORGANIZATION_EXPORT_SECTIONS.length);
		expect(payload.sectionInventory[0]).toHaveProperty('areaKey');
		expect(typeof payload.sectionInventory[0]?.areaKey).toBe('string');
	});
});

// These provider rows specify retained export data independently of the manifest.
describe('retained Organization export projection', () => {
	it.each(['legacy', 'retired'] as const)('exports retained identities with a %s commercial schema', async (schema) => {
		const profile = {
			id: 'org-1',
			name: 'Clinic',
			created_by: 'owner-1',
			created_at: '2026-09-01T00:00:00Z',
			url_slug: 'clinic',
			archive_retention_months: 36,
			suspended_at: '2026-09-19T00:00:00Z',
			critical_tasks_default_expiration_months: 12,
			critical_tasks_expiring_soon_warning_days: 30,
			loss_warning_window_days: 90,
			personnel_document_storage_cap_bytes: 104857600
		};
		const assignment = {
			id: 'assignment-1',
			organization_id: 'org-1',
			date: '2026-09-20',
			assignment_type_id: 'type-1',
			assignee_id: 'person-1',
			assignee_type: 'personnel'
		};
		const groupAssignment = {
			...assignment,
			id: 'assignment-group-1',
			assignment_type_id: 'group-type-1',
			assignee_id: 'group-1',
			assignee_type: 'group'
		};
		const statusType = {
			id: 'status-1',
			organization_id: 'org-1',
			name: 'TDY',
			color: '#4299e1',
			text_color: '#ffffff',
			sort_order: 2,
			created_at: '2026-09-01T00:00:00Z'
		};
		const activeNote = {
			id: 'active-note',
			organization_id: 'org-1',
			personnel_id: 'person-1',
			author: 'original-author',
			text: 'Sensitive active note',
			created_at: '2026-05-01T00:00:00.123456Z',
			archived_at: null
		};
		const archivedNote = {
			...activeNote,
			id: 'archived-note',
			text: 'Sensitive archived note',
			archived_at: '2026-06-01T00:00:00Z'
		};

		const commercialTables = new Set([
			'organization_billing_snapshots',
			'organization_checkout_attempts',
			'organization_plan_feature_overrides'
		]);
		const providerRows: Record<string, Record<string, unknown>[]> = {
			leader_notes: [activeNote, archivedNote, { ...activeNote, id: 'foreign-note', organization_id: 'foreign-org' }],
			personnel_extended_info: [
				{
					id: 'ext-1',
					organization_id: 'org-1',
					personnel_id: 'person-1',
					leader_notes: 'Obsolete value must not reach Personnel summary'
				}
			],
			organizations: [
				{
					...profile,
					...(schema === 'legacy'
						? {
								tier: 'team',
								stripe_customer_id: 'cus_legacy',
								stripe_subscription_id: 'sub_legacy',
								subscription_status: 'active',
								current_period_end: '2027-01-01',
								gift_tier: 'unit',
								gift_expires_at: '2027-01-01',
								gifted_by: 'gifter'
							}
						: {})
				},
				{ ...profile, id: 'foreign-org', name: 'Private' }
			],
			organization_memberships: [{ id: 'membership-1', organization_id: 'org-1', user_id: 'owner-1', role: 'owner' }],
			daily_assignments: [
				assignment,
				groupAssignment,
				{ ...assignment, id: 'foreign-assignment', organization_id: 'foreign-org' }
			],
			assignment_types: [
				{ id: 'type-1', organization_id: 'org-1', name: 'Clinic lead', assign_to: 'personnel' },
				{ id: 'group-type-1', organization_id: 'org-1', name: 'Clinic team', assign_to: 'group' }
			],
			groups: [{ id: 'group-1', organization_id: 'org-1', name: 'Alpha Group' }],
			status_types: [statusType, { ...statusType, id: 'foreign-status', organization_id: 'foreign-org' }],
			availability_entries: [
				{
					id: 'availability-1',
					organization_id: 'org-1',
					personnel_id: 'person-1',
					status_type_id: 'status-1',
					start_date: '2026-09-20',
					end_date: '2026-09-21'
				}
			],
			sign_in_rosters: [{ id: 'roster-1', organization_id: 'org-1', name: 'Clinic training' }],
			personnel: [
				{ id: 'person-1', organization_id: 'org-1', first_name: 'Alex', last_name: 'Example', clinic_role: 'Therapist' }
			]
		};
		const fetchRows = async (input: RequestInfo | URL, denySensitive: boolean) => {
			const url = new URL(String(input));
			const table = url.pathname.split('/').at(-1)!;
			if (
				denySensitive &&
				[
					'personnel_extended_info',
					'counseling_records',
					'leader_notes',
					'personnel_follow_ups',
					'personnel_documents'
				].includes(table)
			)
				return Response.json({ message: 'Direct sensitive read denied' }, { status: 403 });
			if (commercialTables.has(table) || /^(duty_|advanced_duty_)/.test(table))
				return Response.json({ message: 'Retired storage is unavailable' }, { status: 404 });
			const scopeColumn = table === 'organizations' ? 'id' : 'organization_id';
			const scope = url.searchParams.get(scopeColumn)?.replace(/^eq\./, '');
			const rows = (providerRows[table] ?? []).filter((row) => row[scopeColumn] === scope);
			const selection = url.searchParams.get('select');
			if (!selection || selection === '*') return Response.json(rows);
			const columns = selection.split(',');
			if (rows.some((row) => columns.some((column) => !(column in row))))
				return Response.json({ message: 'Unknown column' }, { status: 400 });
			return Response.json(rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))));
		};
		const client = createClient('http://export-provider.test', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: (input) => fetchRows(input, true) }
		});
		const adminClient = createClient('http://export-provider.test', 'synthetic-service-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: { fetch: (input) => fetchRows(input, false) }
		});
		const store = createSupabaseDataStore(client);
		const result = await loadOrganizationExportPayload(
			store,
			createTestAuthContext({ orgId: 'org-1' }),
			createSupabasePersonnelOrganizationExportPort(() => adminClient)
		);
		const json = JSON.parse(JSON.stringify(result));
		expect(json.organizationId).toBe('org-1');
		expect(json.leaderNotes).toEqual([activeNote, archivedNote]);
		expect(json.sections.leaderNotes).toEqual([activeNote, archivedNote]);
		expect(json.sectionInventory).toContainEqual(
			expect.objectContaining({ key: 'leaderNotes', table: 'leader_notes', rowCount: 2 })
		);
		expect(json.organizationProfile).toEqual([profile]);
		expect(json.sections.organizationProfile).toEqual([profile]);
		expect(json.dailyAssignments).toEqual([assignment, groupAssignment]);
		expect(json.statusTypes).toEqual([statusType]);
		expect(json.signInRosters).toEqual(providerRows.sign_in_rosters);
		expect(json.availabilityEntries).toEqual(providerRows.availability_entries);
		expect(json.memberships).toEqual(providerRows.organization_memberships);
		expect(json.sectionInventory.some((section: { areaKey: string }) => section.areaKey === 'duty-rosters')).toBe(
			false
		);
		for (const key of ['billingSnapshot', 'billingCheckoutAttempts', 'planFeatureOverrides']) {
			expect(json).not.toHaveProperty(key);
			expect(json.sections).not.toHaveProperty(key);
			expect(json.sectionInventory.map((section: { key: string }) => section.key)).not.toContain(key);
		}
		const { workbook } = await buildOrganizationDataExportWorkbook({ payload: result });
		const noteSheet = workbook.getWorksheet('Leader Notes')!;
		expect(noteSheet.getRow(2).getCell('author').value).toBe('original-author');
		expect(noteSheet.getRow(2).getCell('text').value).toBe('Sensitive active note');
		expect(noteSheet.getRow(3).getCell('text').value).toBe('Sensitive archived note');
		expect(workbook.getWorksheet('Raw - Leader Notes')!.getSheetValues().flat(2)).toContain('archived-note');
		expect(workbook.getWorksheet('Raw - Leader Notes')!.getSheetValues().flat(2)).not.toContain('foreign-note');
		expect(String(workbook.getWorksheet('Personnel')!.getRow(2).getCell('leader_notes').value ?? '')).toBe('');
		const profileSheet = workbook.getWorksheet('Raw - Organization Profile')!;
		expect(profileSheet.columns.map((column) => column.key)).toEqual(Object.keys(profile));
		expect(profileSheet.getRow(2).values).toEqual([undefined, ...Object.values(profile).map((value) => value ?? '')]);
		expect(workbook.getWorksheet('Raw - Daily Assignments')!.getSheetValues().flat(2)).toContain('assignment-1');
		expect(workbook.getWorksheet('Raw - Daily Assignments')!.getSheetValues().flat(2)).not.toContain(
			'foreign-assignment'
		);
		const readableAssignments = workbook.getWorksheet('Daily Assignments')!.getSheetValues().flat(2);
		expect(readableAssignments).toContain('Alpha Group');
		expect(readableAssignments).toContain('Example, Alex');
		expect(workbook.getWorksheet('Raw - Status Types')!.columns.map((column) => column.key)).toEqual(
			Object.keys(statusType)
		);
		expect(workbook.getWorksheet('Calendar')!.getSheetValues().flat(2)).toContain('TDY');
		expect(workbook.getWorksheet('Raw - Sign-in Rosters')!.getSheetValues().flat(2)).toContain('roster-1');
		expect(workbook.worksheets.some((sheet) => /duty roster|advanced duty/i.test(sheet.name))).toBe(false);
		for (const table of commercialTables)
			expect(workbook.getWorksheet('Export Inventory')!.getSheetValues().flat(2)).not.toContain(table);
		expect(workbook.worksheets.filter((sheet) => /billing|checkout|feature overrides/i.test(sheet.name))).toEqual([]);
	});
});
