import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => true)
}));

// billingState.ts reads isBillingEnabled below the route; mock it so billing-disabled
// snapshots produce the same unlimited quota that production uses.
vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

afterEach(() => {
	billingEnabledMock.mockReturnValue(true);
	vi.restoreAllMocks();
});

describe('POST /api/export', () => {
	it('returns structured plan denial when the monthly export limit is reached', async () => {
		const ctx = createTestContext();
		const now = new Date().toISOString();
		ctx.rawStore.seed('data_exports', [
			{ id: 'export-1', org_id: ctx.auth.orgId, created_at: now, status: 'completed' },
			{ id: 'export-2', org_id: ctx.auth.orgId, created_at: now, status: 'completed' },
			{ id: 'export-3', org_id: ctx.auth.orgId, created_at: now, status: 'completed' }
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});
		const response = _postConfig.formatOutput?.(result);
		const payload = await response?.json();

		expect(response?.status).toBe(429);
		expect(payload).toEqual({
			error: 'Export limit reached (3/month). Upgrade for unlimited exports.',
			denial: {
				code: 'denied.export_quota',
				dimension: 'monthly_exports',
				message: 'Export limit reached (3/month). Upgrade for unlimited exports.',
				remediation: 'Upgrade for unlimited exports or wait until next month.',
				upgradeTarget: 'team'
			}
		});
	});

	it('blocks the created export when concurrent usage pushes the org over quota', async () => {
		const ctx = createTestContext();
		const now = new Date().toISOString();
		ctx.rawStore.seed('data_exports', [
			{ id: 'export-1', org_id: ctx.auth.orgId, created_at: now, status: 'completed' },
			{ id: 'export-2', org_id: ctx.auth.orgId, created_at: now, status: 'completed' }
		]);
		const originalInsert = ctx.rawStore.insert.bind(ctx.rawStore);
		let injectedConcurrentExport = false;
		ctx.rawStore.insert = async (table, orgId, data, select) => {
			if (table === 'data_exports' && !injectedConcurrentExport) {
				injectedConcurrentExport = true;
				await originalInsert(table, orgId, {
					requested_by: 'other-user',
					status: 'completed',
					created_at: now
				});
			}
			return originalInsert(table, orgId, data, select);
		};

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});
		const response = _postConfig.formatOutput?.(result);
		const payload = await response?.json();
		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);

		expect(response?.status).toBe(429);
		expect(payload).toMatchObject({
			error: 'Export limit reached (3/month). Upgrade for unlimited exports.'
		});
		expect(rows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ requested_by: 'other-user', status: 'completed' }),
				expect.objectContaining({ requested_by: ctx.auth.userId, status: 'failed' })
			])
		);
	});

	it('allows export when billing is disabled even if stored export count is above the free quota', async () => {
		billingEnabledMock.mockReturnValue(false);
		const ctx = createTestContext();
		const now = new Date().toISOString();
		ctx.rawStore.seed(
			'data_exports',
			Array.from({ length: 4 }, (_, index) => ({
				id: `export-${index + 1}`,
				org_id: ctx.auth.orgId,
				created_at: now,
				status: 'completed'
			}))
		);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});
		const response = _postConfig.formatOutput?.(result);

		expect(response?.status).toBe(200);
		expect(response?.headers.get('Content-Disposition')).toMatch(/^attachment; filename="org-export-test-org-/);
	});

	it('allows export when a paid team billing snapshot has unlimited exports', async () => {
		const ctx = createTestContext();
		const now = new Date().toISOString();
		ctx.rawStore.seed('organization_billing_snapshots', [billingSnapshot({ commercial_plan: 'team' })]);
		ctx.rawStore.seed(
			'data_exports',
			Array.from({ length: 5 }, (_, index) => ({
				id: `export-${index + 1}`,
				org_id: ctx.auth.orgId,
				created_at: now,
				status: 'completed'
			}))
		);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});
		const response = _postConfig.formatOutput?.(result);

		expect(response?.status).toBe(200);
		expect(response?.headers.get('Content-Disposition')).toMatch(/^attachment; filename="org-export-test-org-/);
	});

	it('includes ETS and DEROS in the organization personnel export payload', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: '2027-05-01',
				deros: '2026-11-30',
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});
		const response = _postConfig.formatOutput?.(result);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected export to be ready');
		const payload = JSON.parse(result.artifact.body) as {
			personnel: Array<Record<string, unknown>>;
		};
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);

		expect(payload.personnel).toEqual([
			expect.objectContaining({
				ets: '2027-05-01',
				deros: '2026-11-30'
			})
		]);
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'completed'
			})
		]);
		expect(response?.headers.get('Content-Disposition')).toMatch(
			/^attachment; filename="org-export-test-org-\d{4}-\d{2}-\d{2}\.json"$/
		);
	});

	it('includes personnel detail artifact tables in the organization export payload', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				group_id: null,
				archived_at: null
			}
		]);
		ctx.rawStore.seed('leader_notes', [
			{
				id: 'note-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				author: ctx.auth.userId,
				text: 'Follow up after range week'
			}
		]);
		ctx.rawStore.seed('personnel_follow_ups', [
			{
				id: 'follow-up-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				title: 'Review packet',
				status: 'open'
			}
		]);
		ctx.rawStore.seed('personnel_documents', [
			{
				id: 'document-1',
				organization_id: ctx.auth.orgId,
				personnel_id: 'p-1',
				title: 'Orders',
				file_path: `${ctx.auth.orgId}/personnel/p-1/documents/orders.pdf`
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected export to be ready');
		const payload = JSON.parse(result.artifact.body) as {
			leaderNotes: Array<Record<string, unknown>>;
			personnelFollowUps: Array<Record<string, unknown>>;
			personnelDocuments: Array<Record<string, unknown>>;
		};

		expect(payload.leaderNotes).toEqual([expect.objectContaining({ id: 'note-1' })]);
		expect(payload.personnelFollowUps).toEqual([expect.objectContaining({ id: 'follow-up-1' })]);
		expect(payload.personnelDocuments).toEqual([expect.objectContaining({ id: 'document-1' })]);
	});

	it('exports archived personnel and new duty roster sections from the shared inventory', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-archived',
				organization_id: ctx.auth.orgId,
				rank: 'SSG',
				last_name: 'Archived',
				first_name: 'Alex',
				archived_at: '2026-05-01T00:00:00Z'
			}
		]);
		ctx.rawStore.seed('duty_roster_templates', [
			{
				id: 'template-1',
				organization_id: ctx.auth.orgId,
				name: 'Staff Duty',
				slug: 'staff-duty',
				status: 'active'
			}
		]);
		ctx.rawStore.seed('duty_roster_template_runs', [
			{
				id: 'run-1',
				organization_id: ctx.auth.orgId,
				template_id: 'template-1',
				template_name: 'Staff Duty',
				snapshot_payload: { rows: [{ date: '2026-05-20', da6: 'D1' }] }
			}
		]);
		ctx.rawStore.seed('duty_roster_template_run_corrections', [
			{
				id: 'correction-1',
				organization_id: ctx.auth.orgId,
				run_id: 'run-1',
				run_row_date: '2026-05-20',
				reason: 'Manual swap'
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected export to be ready');
		const payload = JSON.parse(result.artifact.body) as {
			personnel: Array<Record<string, unknown>>;
			dutyRosterTemplates: Array<Record<string, unknown>>;
			dutyRosterTemplateRuns: Array<Record<string, unknown>>;
			dutyRosterTemplateRunCorrections: Array<Record<string, unknown>>;
			sectionInventory: Array<Record<string, unknown>>;
			sections: Record<string, Array<Record<string, unknown>>>;
		};

		expect(payload.personnel).toEqual([expect.objectContaining({ id: 'p-archived', archived_at: expect.any(String) })]);
		expect(payload.dutyRosterTemplates).toEqual([expect.objectContaining({ id: 'template-1' })]);
		expect(payload.dutyRosterTemplateRuns).toEqual([expect.objectContaining({ id: 'run-1' })]);
		expect(payload.dutyRosterTemplateRunCorrections).toEqual([expect.objectContaining({ id: 'correction-1' })]);
		expect(payload.sections.dutyRosterTemplateRuns).toEqual(payload.dutyRosterTemplateRuns);
		expect(payload.sectionInventory).toContainEqual(
			expect.objectContaining({ key: 'dutyRosterTemplateRuns', table: 'duty_roster_template_runs', rowCount: 1 })
		);
	});

	it('still returns the export payload when the export status write fails', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: '2027-05-01',
				deros: '2026-11-30',
				archived_at: null
			}
		]);

		const originalUpdate = ctx.rawStore.update.bind(ctx.rawStore);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		ctx.rawStore.update = async (...args) => {
			const [table] = args;
			if (table === 'data_exports') {
				throw new Error('UPDATE denied for data_exports');
			}
			return originalUpdate(...args);
		};

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'leader@example.com'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') throw new Error('Expected export to be ready');
		const payload = JSON.parse(result.artifact.body) as {
			personnel: Array<Record<string, unknown>>;
		};
		const exportRows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('[data-exports] Failed to mark export'),
			expect.any(Error)
		);

		expect(payload.personnel).toEqual([
			expect.objectContaining({
				ets: '2027-05-01',
				deros: '2026-11-30'
			})
		]);
		expect(exportRows).toEqual([
			expect.objectContaining({
				requested_by: ctx.auth.userId,
				status: 'processing'
			})
		]);
	});
});

function billingSnapshot(overrides: Record<string, unknown> = {}) {
	return {
		id: 'snapshot-1',
		organization_id: 'test-org',
		source: 'stripe',
		commercial_plan: 'team',
		stripe_customer_id: 'cus_123',
		stripe_subscription_id: 'sub_123',
		stripe_product_id: 'prod_team',
		stripe_price_id: 'price_team',
		subscription_status: 'active',
		collection_status: 'current',
		current_period_start: null,
		current_period_end: null,
		cancel_at_period_end: false,
		canceled_at: null,
		trial_end: null,
		sync_status: 'synced',
		last_stripe_event_id: null,
		last_stripe_event_type: null,
		last_stripe_event_created_at: null,
		last_processed_at: null,
		last_reconciled_at: null,
		reconciliation_result: null,
		drift_detected: false,
		...overrides
	};
}
