import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createSupabaseOrganizationPolicyWritePort } from './settingsProvider.server';
import { updateOrganizationSettings } from './policy.server';

const ORG = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
const FOREIGN = '22222222-2222-4222-8222-222222222222';
type Outcome =
	| 'saved'
	| 'null'
	| 'empty'
	| 'foreign'
	| 'stale-retention'
	| 'stale-warning'
	| 'stale-goal'
	| 'stale-cap'
	| 'single-error'
	| 'error'
	| 'empty-error';

function fixture(outcome: Outcome, uppercaseId = false) {
	const rows = [ORG, FOREIGN].map((id) => ({
		id,
		archive_retention_months: 36,
		loss_warning_window_days: 180,
		training_readiness_goal_percent: 90,
		personnel_document_storage_cap_bytes: 104857600,
		critical_tasks_default_expiration_months: 12
	}));
	const before = structuredClone(rows);
	const requests: { method: string; id: string | null; accept: string | null }[] = [];
	const supabase = createClient('http://policy.invalid', 'synthetic-user-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		global: {
			fetch: async (input, init) => {
				const url = new URL(String(input));
				if (url.pathname !== '/rest/v1/organizations' || init?.method !== 'PATCH')
					throw new Error('Unexpected provider request');
				requests.push({
					method: init.method,
					id: url.searchParams.get('id'),
					accept: new Headers(init.headers).get('accept')
				});
				if (outcome === 'error' || outcome === 'empty-error')
					return Response.json({ message: outcome === 'error' ? 'Save unavailable' : '' }, { status: 500 });
				if (outcome === 'single-error')
					return Response.json(
						{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
						{ status: 406 }
					);
				const values = JSON.parse(String(init.body));
				const row = rows.find((item) => url.searchParams.get('id') === `eq.${item.id}`);
				if (!row) throw new Error('Unknown Organization');
				if (outcome === 'saved') Object.assign(row, values);
				let acknowledgement: unknown = { ...row, ...values };
				if (outcome === 'null') acknowledgement = null;
				if (outcome === 'empty') acknowledgement = [];
				if (outcome === 'foreign') acknowledgement = { ...rows[1], ...values };
				if (outcome === 'stale-retention') acknowledgement = { ...row, ...values, archive_retention_months: 36 };
				if (outcome === 'stale-warning') acknowledgement = { ...row, ...values, loss_warning_window_days: 180 };
				if (outcome === 'stale-goal') acknowledgement = { ...row, ...values, training_readiness_goal_percent: 90 };
				if (outcome === 'stale-cap')
					acknowledgement = { ...row, ...values, personnel_document_storage_cap_bytes: 104857600 };
				return Response.json(acknowledgement);
			}
		}
	});
	const ctx = createTestContext({ auth: { orgId: uppercaseId ? ORG.toUpperCase() : ORG } });
	ctx.organizationPolicyWrite = createSupabaseOrganizationPolicyWritePort(supabase);
	return { ctx, rows, before, requests };
}

const submitted = {
	archiveRetentionMonths: 48.4,
	lossWarningWindowDays: 90.4,
	trainingReadinessGoalPercent: 75,
	personnelDocumentStorageCapMb: 256.4
};

describe('Organization policy save acknowledgement with the actual installed SDK', () => {
	it('persists rounded policy values for one Organization and leaves its neighbor unchanged', async () => {
		const { ctx, rows, before, requests } = fixture('saved');
		expect(await updateOrganizationSettings(ctx, submitted)).toEqual({ success: true });
		expect(rows[0]).toEqual({
			...before[0],
			archive_retention_months: 48,
			loss_warning_window_days: 90,
			training_readiness_goal_percent: 75,
			personnel_document_storage_cap_bytes: 268435456
		});
		expect(rows[1]).toEqual(before[1]);
		expect(requests).toEqual([{ method: 'PATCH', id: `eq.${ORG}`, accept: 'application/vnd.pgrst.object+json' }]);
		expect(ctx.auditPort.events).toMatchObject([
			{
				action: 'organization.settings_updated',
				details: {
					archive_retention_months: 48,
					loss_warning_window_days: 90,
					training_readiness_goal_percent: 75,
					personnel_document_storage_cap_bytes: 268435456
				}
			}
		]);
	});
	it.each([
		'null',
		'empty',
		'foreign',
		'stale-retention',
		'stale-warning',
		'stale-goal',
		'stale-cap',
		'single-error',
		'error',
		'empty-error'
	] as const)('rejects an unacknowledged policy save without success or audit (%s)', async (outcome) => {
		const { ctx, rows, before } = fixture(outcome);
		await expect(updateOrganizationSettings(ctx, submitted)).rejects.toThrow();
		expect(rows).toEqual(before);
		expect(ctx.auditPort.events).toEqual([]);
	});
	it('accepts valid uppercase UUID spelling while saving the canonical lowercase Organization', async () => {
		const { ctx, rows, before } = fixture('saved', true);
		expect(await updateOrganizationSettings(ctx, submitted)).toEqual({ success: true });
		expect(rows[0]).toMatchObject({
			id: ORG,
			archive_retention_months: 48,
			loss_warning_window_days: 90,
			training_readiness_goal_percent: 75,
			personnel_document_storage_cap_bytes: 268435456
		});
		expect(rows[1]).toEqual(before[1]);
	});
});

describe('Feature switch writes with the actual installed SDK', () => {
	it('writes only while the stored switches are unchanged and reapplies a switch after another save lands', async () => {
		const row = { id: ORG, disabled_features: [] as string[], strength_floor_percent: 80 };
		const patches: (string | null)[] = [];
		let interleaved = false;
		const supabase = createClient('http://policy.invalid', 'synthetic-user-key', {
			auth: { persistSession: false, autoRefreshToken: false },
			global: {
				fetch: async (input, init) => {
					const url = new URL(String(input));
					if (url.pathname !== '/rest/v1/organizations') throw new Error('Unexpected provider request');
					if (init?.method === 'GET') return Response.json(structuredClone(row));
					const guard = url.searchParams.get('disabled_features');
					patches.push(guard);
					if (!interleaved) {
						interleaved = true;
						row.disabled_features = ['onboarding'];
					}
					if (guard !== `eq.{${row.disabled_features.map((key) => `"${key}"`).join(',')}}`)
						return Response.json(
							{ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
							{ status: 406 }
						);
					Object.assign(row, JSON.parse(String(init?.body)));
					return Response.json(row);
				}
			}
		});
		const ctx = createTestContext({ auth: { orgId: ORG } });
		ctx.organizationPolicyWrite = createSupabaseOrganizationPolicyWritePort(supabase);

		expect(await updateOrganizationSettings(ctx, { featureSwitch: { feature: 'training', on: false } })).toEqual({
			success: true
		});

		expect(row.disabled_features).toEqual(['training', 'onboarding']);
		expect(patches).toEqual(['eq.{}', 'eq.{"onboarding"}']);
		expect(ctx.auditPort.events.map((event) => event.details)).toEqual([
			{ previous_disabled_features: ['onboarding'], disabled_features: ['training', 'onboarding'] }
		]);
	});
});
