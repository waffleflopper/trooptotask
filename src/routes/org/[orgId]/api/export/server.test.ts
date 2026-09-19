import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('POST /api/export', () => {
	it.each([
		{ label: 'ordinary member', scopeSet: { kind: 'organization' as const } },
		{ label: 'Group-scoped member', scopeSet: { kind: 'groups' as const, groupIds: ['alpha'] } }
	])('rejects $label without exporting or creating lifecycle records', async ({ scopeSet }) => {
		const ctx = createTestContext({ auth: { role: 'member', isPrivileged: false, canManageMembers: false, scopeSet } });
		await expect(handleUseCaseRequest(_postConfig, ctx, { email: 'member@example.com' })).rejects.toMatchObject({
			status: 403
		});
		expect(await ctx.rawStore.findMany('data_exports', ctx.auth.orgId)).toEqual([]);
		expect(
			ctx.auditPort.events.filter(
				(event) => event.action === 'export.created' || event.action === 'export.excel_created'
			)
		).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
	});

	it('downloads above former quotas and excludes another Organization', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed(
			'data_exports',
			Array.from({ length: 11 }, (_, i) => ({
				id: `previous-${i}`,
				org_id: ctx.auth.orgId,
				created_at: new Date().toISOString(),
				status: 'completed'
			}))
		);
		ctx.rawStore.seed('personnel', [
			{ id: 'own-person', organization_id: ctx.auth.orgId, first_name: 'Local', last_name: 'Person', rank: 'SGT' },
			{ id: 'foreign-person', organization_id: 'other-org', first_name: 'Private', last_name: 'Foreign', rank: 'SGT' }
		]);
		const result = await handleUseCaseRequest(_postConfig, ctx, { email: 'owner@example.com' });
		const response = _postConfig.formatOutput?.(result);
		expect(response?.status).toBe(200);
		expect(response?.headers.get('Content-Disposition')).toMatch(/^attachment; filename="org-export-test-org-/);
		expect((await response!.json()).personnel.map((person: { id: string }) => person.id)).toEqual(['own-person']);
		const rows = await ctx.rawStore.findMany<Record<string, unknown>>('data_exports', ctx.auth.orgId);
		expect(rows).toHaveLength(12);
		expect(rows.find((row) => row.requested_by === ctx.auth.userId)).toMatchObject({ status: 'completed' });
	});

	it('uses the organization data export policy boundary', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.organization.exportData);
		expect(_postConfig.policyResource).toEqual({ kind: 'organization' });
	});

	it('allows delegated member managers to export organization data', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				canManageMembers: true
			}
		});

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			email: 'member-manager@example.com'
		});

		expect(result.status).toBe('ready');
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
