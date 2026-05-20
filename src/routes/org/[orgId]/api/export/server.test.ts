import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('POST /api/export', () => {
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

		const payload = JSON.parse(result._json as string) as {
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

		const payload = JSON.parse(result._json as string) as {
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

		const payload = JSON.parse(result._json as string) as {
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

		const payload = JSON.parse(result._json as string) as {
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
