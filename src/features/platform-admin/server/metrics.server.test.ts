import type { PlatformMetricsStore } from '../organizationSupportTypes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryPlatformMetricsStore } from './inMemoryMetrics.test-support';
import { createPlatformMetrics, displayOwnerMembership } from './metrics.server';

function makeMetrics() {
	const store = createInMemoryPlatformMetricsStore({
		memberships: [
			{ organizationId: 'org-1', userId: 'owner-1', email: 'owner-1@example.mil', role: 'owner' },
			{ organizationId: 'org-1', userId: 'member-1', email: 'member-1@example.mil', role: 'member' },
			{ organizationId: 'org-2', userId: 'owner-2', email: 'owner-2@example.mil', role: 'owner' },
			{ organizationId: 'org-3', userId: 'owner-3a', email: 'owner-3a@example.mil', role: 'owner' },
			{ organizationId: 'org-3', userId: 'owner-3b', email: 'owner-3b@example.mil', role: 'owner' },
			{ organizationId: 'org-4', userId: 'owner-4', email: null, role: 'owner' }
		],
		personnel: [
			{ organizationId: 'org-1', archivedAt: null },
			{ organizationId: 'org-1', archivedAt: null },
			{ organizationId: 'org-2', archivedAt: null },
			{ organizationId: 'org-2', archivedAt: '2026-01-01T00:00:00.000Z' },
			{ organizationId: 'other-org', archivedAt: null }
		]
	});
	return createPlatformMetrics({ store });
}

describe('PlatformMetrics', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('summarizes Organization membership, active personnel, and owner metrics through the public interface', async () => {
		const metrics = makeMetrics();
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		const result = await metrics.getOrganizationMetrics(['org-1', 'org-2', 'org-3', 'org-4', 'org-5']);

		expect(result.memberCounts.get('org-1')).toBe(2);
		expect(result.memberCounts.get('org-2')).toBe(1);
		expect(result.activePersonnelCounts.get('org-1')).toBe(2);
		expect(result.activePersonnelCounts.get('org-2')).toBe(1);
		expect(result.activePersonnelCounts.get('org-5')).toBeUndefined();
		expect(result.ownerMemberships.get('org-1')).toMatchObject({
			kind: 'single',
			membership: { userId: 'owner-1', email: 'owner-1@example.mil' }
		});
		expect(result.ownerMemberships.get('org-3')).toEqual({ kind: 'multiple', count: 2 });
		expect(result.ownerMemberships.get('org-5')).toEqual({ kind: 'none' });
		expect(displayOwnerMembership(result.ownerMemberships.get('org-1'))).toBe('owner-1@example.mil');
		expect(displayOwnerMembership(result.ownerMemberships.get('org-4'))).toBe('');
		expect(displayOwnerMembership(result.ownerMemberships.get('org-3'))).toBe('Multiple owners');
		expect(displayOwnerMembership(result.ownerMemberships.get('org-5'))).toBe('No owner');
	});

	it('returns empty metric maps when no Organization IDs are requested', async () => {
		const metrics = makeMetrics();

		const result = await metrics.getOrganizationMetrics([]);

		expect(result.memberCounts.size).toBe(0);
		expect(result.activePersonnelCounts.size).toBe(0);
		expect(result.ownerMemberships.size).toBe(0);
	});

	it('keeps the aggregate reader usable as a standalone port function', async () => {
		const metrics = makeMetrics();
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { getOrganizationMetrics } = metrics;

		const result = await getOrganizationMetrics(['org-1']);

		expect(result.memberCounts.get('org-1')).toBe(2);
		expect(result.activePersonnelCounts.get('org-1')).toBe(2);
		expect(displayOwnerMembership(result.ownerMemberships.get('org-1'))).toBe('owner-1@example.mil');
	});

	it('exposes active personnel counts independently for dependent admin modules', async () => {
		const metrics = makeMetrics();

		const counts = await metrics.countActivePersonnelByOrganization(['org-1', 'org-2', 'missing-org']);

		expect(counts.get('org-1')).toBe(2);
		expect(counts.get('org-2')).toBe(1);
		expect(counts.get('missing-org')).toBeUndefined();
	});

	it('exposes a single-Organization active personnel count for detail pages', async () => {
		const metrics = makeMetrics();

		await expect(metrics.countActivePersonnelForOrganization('org-1')).resolves.toBe(2);
		await expect(metrics.countActivePersonnelForOrganization('missing-org')).resolves.toBe(0);
	});

	it.each([
		'countMembershipsByOrganization',
		'countActivePersonnelByOrganization',
		'getOwnerMembershipsByOrganization',
		'countActivePersonnelForOrganization'
	] as const)('propagates a failed %s read instead of false zero/no-owner data', async (method) => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const failed = async () => {
			throw new Error('metrics unavailable');
		};
		const store: PlatformMetricsStore = {
			countMembershipsByOrganization: failed,
			countActivePersonnelByOrganization: failed,
			countActivePersonnelForOrganization: failed,
			listOwnerMembershipMetricsByOrganization: failed
		};
		const metrics = createPlatformMetrics({ store });
		const read =
			method === 'countActivePersonnelForOrganization' ? metrics[method]('org-1') : metrics[method](['org-1']);
		await expect(read).rejects.toThrow('metrics unavailable');
	});
	it('does not describe an unidentified single-owner metric as no owner', async () => {
		const store = createInMemoryPlatformMetricsStore();
		store.listOwnerMembershipMetricsByOrganization = async () => [
			{ organizationId: 'org-1', ownerCount: 1, singleOwner: null }
		];
		await expect(createPlatformMetrics({ store }).getOwnerMembershipsByOrganization(['org-1'])).rejects.toThrow(
			'Owner membership could not be identified'
		);
	});
});
