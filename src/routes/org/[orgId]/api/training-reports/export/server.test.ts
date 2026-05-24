import { afterEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { WORKBOOK_MIME_TYPE } from '$lib/export/workbook';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => true)
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

type WorkbookLoadBuffer = Parameters<ExcelJS.Workbook['xlsx']['load']>[0];

afterEach(() => {
	billingEnabledMock.mockReturnValue(true);
	vi.restoreAllMocks();
});

function toWorkbookBuffer(buffer: ArrayBuffer): WorkbookLoadBuffer {
	return buffer;
}

describe('GET /api/training-reports/export', () => {
	it('returns structured plan denial when advanced reporting is unavailable', async () => {
		const ctx = createTestContext();

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			sortColumn: 'name',
			sortDirection: 'asc'
		});
		const response = _getConfig.formatOutput?.(result);
		const payload = await response?.json();

		expect(response?.status).toBe(403);
		expect(payload).toEqual({
			error: 'Advanced reporting is not available on your current plan.',
			denial: {
				code: 'denied.plan_feature_unavailable',
				dimension: 'billing_state',
				featureKey: 'advanced_reporting',
				featureLabel: 'Advanced reporting',
				message: 'Advanced reporting is not available on your current plan.',
				remediation: 'Upgrade to unit to use this feature.',
				upgradeTarget: 'unit'
			}
		});
	});

	it('allows training report export when billing is disabled', async () => {
		billingEnabledMock.mockReturnValue(false);
		const ctx = createTestContext();

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			sortColumn: 'name',
			sortDirection: 'asc'
		});

		expect('_planDenied' in result).toBe(false);
	});

	it('uses training read permission and returns workbook download output', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('organizations', [
			{
				id: ctx.auth.orgId,
				tier: 'unit',
				stripe_customer_id: null,
				stripe_subscription_id: null,
				subscription_status: null,
				current_period_end: null,
				gift_tier: null,
				gift_expires_at: null
			}
		]);

		ctx.store.seed('personnel', [
			{
				id: 'p-smith',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				archived_at: null,
				groups: { name: 'Alpha' }
			}
		]);
		ctx.store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ctx.auth.orgId,
				name: 'CPR',
				description: null,
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);

		expect(_getConfig.permission).toBe('training');
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.viewRecords);
		expect(_getConfig.policyResource).toEqual({ kind: 'unscoped' });

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			sortColumn: 'name',
			sortDirection: 'asc'
		});
		if ('_planDenied' in result) throw new Error('Expected training report workbook');
		const response = _getConfig.formatOutput?.(result);
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(toWorkbookBuffer(result.buffer));
		const sheet = workbook.getWorksheet('Training Report')!;

		expect(sheet.getRow(1).values).toEqual([undefined, 'Name', 'Rank', 'MOS', 'Duty Role', 'Group', 'CPR']);
		expect(sheet.getRow(2).values).toEqual([undefined, 'Smith, Jane', 'SGT', '68W', 'Medic', 'Alpha', 'Not Done']);
		expect(response?.headers.get('Content-Type')).toBe(WORKBOOK_MIME_TYPE);
		expect(response?.headers.get('Content-Disposition')).toMatch(/attachment; filename="training-report-.*\.xlsx"/);
		expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response?.headers.get('Vary')).toBe('Cookie');
	});
});
