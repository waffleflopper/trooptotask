import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { FeatureKey } from '$lib/access/featureSwitches';
import type { AuditLogEntry } from '$lib/audit/contracts';
import { loadExportsSettings, loadLastExport } from './settingsExports.server';

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

function setup(role: 'owner' | 'admin', latest: Record<string, AuditLogEntry>, disabledFeatures: FeatureKey[] = []) {
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
		disabledFeatures,
		readLatestAuditEvent: async (action: string) => {
			auditReads.push(action);
			return latest[action] ?? null;
		}
	};
	return { ports, auditReads };
}

describe('Exports settings load', () => {
	it('streams the unit counts that scope an export', async () => {
		const { ports } = setup('owner', {});

		expect(await loadExportsSettings(ports).scopeCounts).toEqual({ activePersonnel: 1, trainingRecords: 2 });
	});

	it('hands the page the turned-off features that an export leaves out', () => {
		const { ports } = setup('owner', {}, ['training', 'onboarding']);

		expect(loadExportsSettings(ports).disabledFeatures).toEqual(['training', 'onboarding']);
	});
});

describe('Last export load', () => {
	it('gives owners the newer of the latest JSON and Excel exports', async () => {
		const { ports } = setup('owner', {
			'export.created': exportEvent('export.created', '2026-10-01T08:00:00.000Z', 'lane@example.com'),
			'export.excel_created': exportEvent('export.excel_created', '2026-10-12T09:14:00.000Z', 'whitaker@example.com')
		});

		expect(await loadLastExport(ports)).toEqual({
			format: 'excel',
			at: '2026-10-12T09:14:00.000Z',
			actor: 'whitaker@example.com'
		});
	});

	it('reads JSON as the last export when the unit has never exported Excel', async () => {
		const { ports } = setup('owner', {
			'export.created': exportEvent('export.created', '2026-10-01T08:00:00.000Z', 'lane@example.com')
		});

		expect(await loadLastExport(ports)).toEqual({
			format: 'json',
			at: '2026-10-01T08:00:00.000Z',
			actor: 'lane@example.com'
		});
	});

	it('reads no last export when the audit log holds none', async () => {
		const { ports } = setup('owner', {});

		expect(await loadLastExport(ports)).toBeNull();
	});

	it('leaves the last export empty for admins without reading the audit log', () => {
		const { ports, auditReads } = setup('admin', {
			'export.created': exportEvent('export.created', '2026-10-01T08:00:00.000Z', 'lane@example.com')
		});

		expect(loadLastExport(ports)).toBeNull();
		expect(auditReads).toEqual([]);
	});
});
