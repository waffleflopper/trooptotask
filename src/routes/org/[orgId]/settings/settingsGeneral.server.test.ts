import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { AuditLogEntry } from '$lib/audit/contracts';
import { loadGeneralSettings } from './settingsGeneral.server';

const ORGANIZATION = { id: 'org-1', name: 'C Co, 526th BSB', urlSlug: 'c-co-526', urlSegment: 'c-co-526' };

const RENAMED: AuditLogEntry = {
	id: 'log-1',
	userId: 'user-1',
	actor: 'whitaker@example.com',
	action: 'org.renamed',
	resourceType: 'organization',
	resourceId: null,
	details: { name: 'C Co, 526th BSB' },
	createdAt: '2026-03-14T15:00:00.000Z'
};

function setup(role: 'owner' | 'admin') {
	const ctx = createTestContext({ auth: { orgId: 'org-1', role, isPrivileged: true } });
	ctx.rawStore.seed('status_types', [
		{ id: 's1', organization_id: 'org-1' },
		{ id: 's2', organization_id: 'org-1' },
		{ id: 's3', organization_id: 'org-2' }
	]);
	ctx.rawStore.seed('assignment_types', [
		{ id: 'a1', organization_id: 'org-1', archived_at: null },
		{ id: 'a2', organization_id: 'org-1', archived_at: '2026-01-01T00:00:00.000Z' }
	]);
	ctx.rawStore.seed('special_days', [{ id: 'd1', organization_id: 'org-1' }]);
	const auditReads: string[] = [];
	const ports = {
		auth: ctx.auth,
		unitCounts: ctx.unitCounts,
		readLatestAuditEvent: async (action: string) => {
			auditReads.push(action);
			return action === 'org.renamed' ? RENAMED : null;
		}
	};
	return { ports, auditReads };
}

describe('General settings load', () => {
	it('gives owners the latest rename and the unit Calendar counts', async () => {
		const { ports } = setup('owner');

		const data = loadGeneralSettings(ports, ORGANIZATION);

		expect(data.organization).toEqual(ORGANIZATION);
		expect(await data.lastRenamed).toEqual({ at: '2026-03-14T15:00:00.000Z', actor: 'whitaker@example.com' });
		expect(await data.calendarCounts).toEqual({ statusTypes: 2, assignmentTypes: 1, specialDays: 1 });
	});

	it('leaves the last rename empty for admins without reading the audit log', async () => {
		const { ports, auditReads } = setup('admin');

		const data = loadGeneralSettings(ports, ORGANIZATION);

		expect(data.lastRenamed).toBeNull();
		expect(auditReads).toEqual([]);
		expect(await data.calendarCounts).toEqual({ statusTypes: 2, assignmentTypes: 1, specialDays: 1 });
	});
});
