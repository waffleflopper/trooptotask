import { describe, expect, it } from 'vitest';
import type { DataStore } from '../ports';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseDataStore } from '$lib/server/adapters/supabaseDataStore';
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

		const payload = await loadOrganizationExportPayload(store, 'org-1');

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
		const commercialTables = new Set([
			'organization_billing_snapshots',
			'organization_checkout_attempts',
			'organization_plan_feature_overrides'
		]);
		const providerRows: Record<string, Record<string, unknown>[]> = {
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
			status_types: [
				{ ...statusType, da6_availability_treatment: 'other-duty', da6_treatment_reviewed: true },
				{ ...statusType, id: 'foreign-status', organization_id: 'foreign-org' }
			],
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
		const client = createClient('http://export-provider.test', 'synthetic-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input) => {
					const url = new URL(String(input));
					const table = url.pathname.split('/').at(-1)!;
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
				}
			}
		});
		const result = await loadOrganizationExportPayload(createSupabaseDataStore(client), 'org-1');
		const json = JSON.parse(JSON.stringify(result));
		expect(json.organizationId).toBe('org-1');
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
