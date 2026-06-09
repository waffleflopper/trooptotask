import { describe, expect, it } from 'vitest';
import { createInMemoryPlatformMetricsStore } from '$lib/server/adapters/inMemoryPlatformMetrics';
import { createInMemoryPlatformUserDirectoryStore } from '$lib/server/adapters/inMemoryPlatformUserDirectory';
import { createPlatformMetrics } from './platformMetrics';
import { createPlatformUserDirectory } from './platformUserDirectory';

function createSubject(
	options: Parameters<typeof createInMemoryPlatformUserDirectoryStore>[0],
	metricsSeed: Parameters<typeof createInMemoryPlatformMetricsStore>[0] = {}
) {
	return createPlatformUserDirectory({
		store: createInMemoryPlatformUserDirectoryStore(options),
		metrics: createPlatformMetrics({ store: createInMemoryPlatformMetricsStore(metricsSeed) })
	});
}

describe('PlatformUserDirectory', () => {
	it('shapes the paged users list with organization counts and suspension status', async () => {
		const directory = createSubject({
			authUsers: [
				{
					id: 'user-old',
					email: 'able@example.test',
					createdAt: '2026-06-01T00:00:00.000Z',
					lastSignInAt: null
				},
				{
					id: 'user-new',
					email: 'bravo@example.test',
					createdAt: '2026-06-03T00:00:00.000Z',
					lastSignInAt: null
				},
				{
					id: 'user-suspended',
					email: 'bravo.suspended@example.test',
					createdAt: '2026-06-02T00:00:00.000Z',
					lastSignInAt: null
				}
			],
			memberships: [
				{
					userId: 'user-new',
					role: 'owner',
					organization: { id: 'org-a', name: 'Able', tier: 'team', giftTier: null }
				},
				{
					userId: 'user-new',
					role: 'member',
					organization: { id: 'org-b', name: 'Bravo', tier: 'free', giftTier: null }
				},
				{
					userId: 'user-suspended',
					role: 'admin',
					organization: { id: 'org-c', name: 'Charlie', tier: 'unit', giftTier: null }
				}
			],
			suspensions: [
				{
					userId: 'user-suspended',
					suspendedAt: '2026-06-04T00:00:00.000Z',
					suspendedBy: 'admin-1',
					reason: 'Policy review'
				}
			]
		});

		const result = await directory.listUsers({ search: 'bravo', page: 1, limit: 1 });

		expect(result).toEqual({
			users: [
				{
					id: 'user-new',
					email: 'bravo@example.test',
					organizationCount: 2,
					createdAt: '2026-06-03T00:00:00.000Z',
					isSuspended: false
				}
			],
			totalCount: 2,
			page: 1,
			limit: 1,
			search: 'bravo',
			authError: null
		});
	});

	it('surfaces auth-provider list failures without shaping stale rows', async () => {
		const directory = createSubject({ authError: 'service unavailable' });

		await expect(directory.listUsers({ search: 'bravo', page: 2, limit: 20 })).resolves.toEqual({
			users: [],
			totalCount: 0,
			page: 2,
			limit: 20,
			search: 'bravo',
			authError: 'service unavailable'
		});
	});

	it('shapes user detail memberships with effective tier and personnel counts', async () => {
		const directory = createSubject(
			{
				authUsers: [
					{
						id: 'user-1',
						email: 'commander@example.test',
						createdAt: '2026-06-01T00:00:00.000Z',
						lastSignInAt: '2026-06-08T00:00:00.000Z'
					}
				],
				memberships: [
					{
						userId: 'user-1',
						role: 'owner',
						organization: { id: 'org-a', name: 'Able Company', tier: 'team', giftTier: 'unit' }
					},
					{
						userId: 'user-1',
						role: 'member',
						organization: { id: 'org-b', name: 'Bravo Company', tier: 'free', giftTier: null }
					}
				]
			},
			{
				personnel: [
					{ organizationId: 'org-a', archivedAt: null },
					{ organizationId: 'org-a', archivedAt: '2026-01-01T00:00:00.000Z' },
					{ organizationId: 'org-b', archivedAt: null }
				]
			}
		);

		const result = await directory.getUserDetail('user-1');

		expect(result).toEqual({
			status: 'found',
			detail: {
				user: {
					id: 'user-1',
					email: 'commander@example.test',
					createdAt: '2026-06-01T00:00:00.000Z',
					lastSignInAt: '2026-06-08T00:00:00.000Z'
				},
				organizations: [
					{
						id: 'org-a',
						name: 'Able Company',
						role: 'owner',
						subscriptionTier: 'unit',
						personnelCount: 1
					},
					{
						id: 'org-b',
						name: 'Bravo Company',
						role: 'member',
						subscriptionTier: 'free',
						personnelCount: 1
					}
				],
				suspension: null,
				isSuspended: false
			}
		});
	});

	it('shapes suspended user detail', async () => {
		const directory = createSubject({
			authUsers: [
				{
					id: 'user-1',
					email: 'suspended@example.test',
					createdAt: '2026-06-01T00:00:00.000Z',
					lastSignInAt: null
				}
			],
			suspensions: [
				{
					userId: 'user-1',
					suspendedAt: '2026-06-04T00:00:00.000Z',
					suspendedBy: 'admin-1',
					reason: null
				}
			]
		});

		await expect(directory.getUserDetail('user-1')).resolves.toMatchObject({
			status: 'found',
			detail: {
				suspension: {
					suspendedAt: '2026-06-04T00:00:00.000Z',
					suspendedBy: 'admin-1',
					reason: null
				},
				isSuspended: true
			}
		});
	});

	it('returns empty organizations for users without memberships', async () => {
		const directory = createSubject({
			authUsers: [
				{
					id: 'user-1',
					email: null,
					createdAt: '2026-06-01T00:00:00.000Z',
					lastSignInAt: null
				}
			]
		});

		await expect(directory.getUserDetail('user-1')).resolves.toMatchObject({
			status: 'found',
			detail: {
				user: { email: 'No email' },
				organizations: [],
				suspension: null,
				isSuspended: false
			}
		});
	});

	it('preserves empty-string auth emails while still defaulting null emails', async () => {
		const directory = createSubject({
			authUsers: [
				{
					id: 'empty-email-user',
					email: '',
					createdAt: '2026-06-01T00:00:00.000Z',
					lastSignInAt: null
				}
			]
		});

		await expect(directory.getUserDetail('empty-email-user')).resolves.toMatchObject({
			status: 'found',
			detail: {
				user: { email: '' }
			}
		});
	});

	it('distinguishes missing users from auth-provider detail failures', async () => {
		await expect(createSubject({}).getUserDetail('missing-user')).resolves.toEqual({ status: 'not_found' });
		await expect(
			createSubject({ authDetailError: 'identity provider unavailable' }).getUserDetail('user-1')
		).resolves.toEqual({
			status: 'auth_error',
			message: 'identity provider unavailable'
		});
	});
});
