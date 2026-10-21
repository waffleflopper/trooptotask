import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { AuditLogEntry } from '$lib/audit/contracts';
import { loadExportsSettings } from './settingsExports.server';

function exportEvent(action: string, createdAt: string, actor: string): AuditLogEntry {
	return {
		id: `${action}-${createdAt}`,
		userId: 'user-1',
		actor,
		action,
		resourceType: 'data_export',
		resourceId: null,
		details: null,
		createdAt
	};
}

function setup(role: 'owner' | 'admin', latest: Record<string, AuditLogEntry>) {
	const ctx = createTestContext({ auth: { orgId: 'org-1', role, isPrivileged: true } });
	ctx.rawStore.seed('personnel', [
		{ id: 'p1', organization_id: 'org-1', archived_at: null },
		{ id: 'p2', organization_id: 'org-1', archived_at: '2026-01-01T00:00:00.000Z' },
		{ id: 'p3', organization_id: 'org-2', archived_at: null }
	]);
	ctx.rawStore.seed('personnel_trainings', [
		{ id: 't1', organization_id: 'org-1' },
		{ id: 't2', organization_id: 'org-1' },
		{ id: 't3', organization_id: 'org-2' }
	]);
	const auditReads: string[] = [];
	const ports = {
		auth: ctx.auth,
		unitCounts: ctx.unitCounts,
		readLatestAuditEvent: async (action: string) => {
			auditReads.push(action);
			return latest[action] ?? null;
		}
	};
	return { ports, auditReads };
}

describe('Exports settings load', () => {
	it('gives owners the newer of the latest JSON and Excel exports, and the scope counts', async () => {
		const { ports } = setup('owner', {
			'export.created': exportEvent('export.created', '2026-10-01T08:00:00.000Z', 'lane@example.com'),
			'export.excel_created': exportEvent('export.excel_created', '2026-10-12T09:14:00.000Z', 'whitaker@example.com')
		});

		const data = loadExportsSettings(ports);

		expect(await data.lastExport).toEqual({
			format: 'excel',
			at: '2026-10-12T09:14:00.000Z',
			actor: 'whitaker@example.com'
		});
		expect(await data.scopeCounts).toEqual({ activePersonnel: 1, trainingRecords: 2 });
	});

	it('reads JSON as the last export when the unit has never exported Excel', async () => {
		const { ports } = setup('owner', {
			'export.created': exportEvent('export.created', '2026-10-01T08:00:00.000Z', 'lane@example.com')
		});

		expect(await loadExportsSettings(ports).lastExport).toEqual({
			format: 'json',
			at: '2026-10-01T08:00:00.000Z',
			actor: 'lane@example.com'
		});
	});

	it('reads no last export when the audit log holds none', async () => {
		const { ports } = setup('owner', {});

		expect(await loadExportsSettings(ports).lastExport).toBeNull();
	});

	it('leaves the last export empty for admins without reading the audit log', async () => {
		const { ports, auditReads } = setup('admin', {
			'export.created': exportEvent('export.created', '2026-10-01T08:00:00.000Z', 'lane@example.com')
		});

		const data = loadExportsSettings(ports);

		expect(data.lastExport).toBeNull();
		expect(auditReads).toEqual([]);
		expect(await data.scopeCounts).toEqual({ activePersonnel: 1, trainingRecords: 2 });
	});
});
