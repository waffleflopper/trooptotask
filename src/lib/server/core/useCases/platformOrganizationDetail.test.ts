import { describe, expect, it, vi } from 'vitest';
import {
	createPlatformOrganizationDetail,
	type PlatformOrganizationDetailDependencies,
	type PlatformOrganizationDetailOrganizationRow
} from './platformOrganizationDetail';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function organization(overrides: Partial<PlatformOrganizationDetailOrganizationRow> = {}) {
	return {
		id: ORG_ID,
		name: 'Able Company',
		suspended_at: null,
		created_at: '2026-06-01T00:00:00.000Z',
		...overrides
	} satisfies PlatformOrganizationDetailOrganizationRow;
}

function makeDependencies(): PlatformOrganizationDetailDependencies {
	return {
		store: {
			getOrganizationById: vi.fn(async (orgId) => (orgId === ORG_ID ? organization() : null))
		},
		adminRole: 'super_admin',
		membershipAdministration: {
			listMembers: vi.fn(async (orgId) =>
				orgId === ORG_ID
					? [
							{ userId: 'owner-1', email: 'owner@example.com', role: 'owner' as const },
							{ userId: 'member-1', email: null, role: 'member' as const }
						]
					: [{ userId: 'other-owner', email: 'other@example.com', role: 'owner' as const }]
			),
			makeAdmin: vi.fn(),
			transferOwnership: vi.fn()
		},
		metrics: {
			countMembershipsByOrganization: vi.fn(),
			countActivePersonnelByOrganization: vi.fn(),
			countActivePersonnelForOrganization: vi.fn(async (orgId) => (orgId === ORG_ID ? 7 : 12)),
			getOwnerMembershipsByOrganization: vi.fn(),
			getOrganizationMetrics: vi.fn()
		},
		audit: {
			listLogs: vi.fn(),
			listRecentByOrganization: vi.fn(async ({ orgId }) => [
				{
					id: orgId === ORG_ID ? 'audit-1' : 'other-audit',
					action: 'admin.org.suspend',
					userId: 'admin-1',
					timestamp: '2026-06-08T16:00:00.000Z',
					severity: 'info',
					resourceType: 'organization',
					resourceId: orgId
				}
			]),
			listRecentByUser: vi.fn()
		}
	};
}

describe('createPlatformOrganizationDetail', () => {
	it('returns retained identity, membership, personnel and audit data for the requested organization', async () => {
		const result = await createPlatformOrganizationDetail(makeDependencies()).getOrganizationDetail(ORG_ID);

		expect(result).toEqual({
			status: 'found',
			detail: {
				adminRole: 'super_admin',
				org: {
					id: ORG_ID,
					name: 'Able Company',
					suspendedAt: null,
					createdAt: '2026-06-01T00:00:00.000Z',
					isSuspended: false
				},
				members: [
					{ userId: 'owner-1', email: 'owner@example.com', role: 'owner' },
					{ userId: 'member-1', email: '(unknown)', role: 'member' }
				],
				personnelCount: 7,
				auditEvents: [
					{
						id: 'audit-1',
						action: 'admin.org.suspend',
						userId: 'admin-1',
						timestamp: '2026-06-08T16:00:00.000Z',
						severity: 'info',
						resourceType: 'organization',
						resourceId: ORG_ID
					}
				]
			}
		});
	});

	it('preserves suspension state and support administrator identity', async () => {
		const deps = makeDependencies();
		deps.adminRole = 'support';
		vi.mocked(deps.store.getOrganizationById).mockResolvedValue(
			organization({ suspended_at: '2026-06-08T16:00:00.000Z' })
		);

		await expect(createPlatformOrganizationDetail(deps).getOrganizationDetail(ORG_ID)).resolves.toMatchObject({
			status: 'found',
			detail: {
				adminRole: 'support',
				org: { isSuspended: true, suspendedAt: '2026-06-08T16:00:00.000Z' }
			}
		});
	});

	it('returns not_found without exposing memberships for an unknown organization', async () => {
		await expect(
			createPlatformOrganizationDetail(makeDependencies()).getOrganizationDetail('missing-organization')
		).resolves.toEqual({ status: 'not_found' });
	});

	it.each(['organization', 'membership', 'personnel', 'audit'] as const)(
		'returns a provider error instead of partial detail when the %s read fails',
		async (failure) => {
			const deps = makeDependencies();
			const readers = {
				organization: deps.store.getOrganizationById,
				membership: deps.membershipAdministration.listMembers,
				personnel: deps.metrics.countActivePersonnelForOrganization,
				audit: deps.audit.listRecentByOrganization
			};
			vi.mocked(readers[failure]).mockRejectedValueOnce(new Error('database unavailable'));

			await expect(createPlatformOrganizationDetail(deps).getOrganizationDetail(ORG_ID)).resolves.toEqual({
				status: 'provider_error',
				message: 'database unavailable'
			});
		}
	);
});
