import { describe, expect, it } from 'vitest';
import { createInMemoryPlatformMetricsStore } from './inMemoryMetrics.test-support.server';
import { createInMemoryPlatformUserDirectorySources } from './inMemoryUserDirectory.test-support.server';
import { createPlatformUserDirectory } from './userDirectory.server';

function createSubject(
	options: Parameters<typeof createInMemoryPlatformUserDirectorySources>[0],
	metricsSeed: Parameters<typeof createInMemoryPlatformMetricsStore>[0] = {}
) {
	return createPlatformUserDirectory({
		...createInMemoryPlatformUserDirectorySources(options),
		personnel: createInMemoryPlatformMetricsStore(metricsSeed)
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
					lastSignInAt: null,
					emailConfirmedAt: null
				},
				{
					id: 'user-new',
					email: 'bravo@example.test',
					createdAt: '2026-06-03T00:00:00.000Z',
					lastSignInAt: null,
					emailConfirmedAt: '2026-06-03T00:05:00.000Z'
				},
				{
					id: 'user-suspended',
					email: 'bravo.suspended@example.test',
					createdAt: '2026-06-02T00:00:00.000Z',
					lastSignInAt: null,
					emailConfirmedAt: null
				}
			],
			memberships: [
				{
					userId: 'user-new',
					role: 'owner',
					organization: { id: 'org-a', name: 'Able' }
				},
				{
					userId: 'user-new',
					role: 'member',
					organization: { id: 'org-b', name: 'Bravo' }
				},
				{
					userId: 'user-suspended',
					role: 'admin',
					organization: { id: 'org-c', name: 'Charlie' }
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
					isSuspended: false,
					emailConfirmedAt: '2026-06-03T00:05:00.000Z',
					emailConfirmationStatus: 'confirmed'
				}
			],
			totalCount: 2,
			page: 1,
			limit: 1,
			search: 'bravo',
			authError: null
		});
		await expect(directory.listUsers({ search: 'BRAVO', page: 2, limit: 1 })).resolves.toMatchObject({
			totalCount: 2,
			page: 2,
			limit: 1,
			authError: null,
			users: [{ id: 'user-suspended', organizationCount: 1, isSuspended: true, emailConfirmationStatus: 'pending' }]
		});
	});

	it('keeps distinct stable pages when tied accounts arrive in different provider orders', async () => {
		const accounts = ['user-a', 'user-z', 'user-m'].map((id) => ({
			id,
			email: `${id}@example.test`,
			createdAt: '2026-06-01T00:00:00.000Z',
			lastSignInAt: null,
			emailConfirmedAt: null
		}));
		const sources = createInMemoryPlatformUserDirectorySources({ authUsers: accounts });
		let read = 0;
		sources.identity.listAuthUsers = async () => ({
			status: 'ok',
			users: read++ === 0 ? accounts : [...accounts].reverse()
		});
		const directory = createPlatformUserDirectory({ ...sources, personnel: createInMemoryPlatformMetricsStore({}) });
		const first = await directory.listUsers({ search: '', page: 1, limit: 2 });
		const second = await directory.listUsers({ search: '', page: 2, limit: 2 });
		expect(first.users.map((user) => user.id)).toEqual(['user-z', 'user-m']);
		expect(second.users.map((user) => user.id)).toEqual(['user-a']);
		expect(first.totalCount).toBe(3);
		expect(second.totalCount).toBe(3);
	});

	it('shows the last page when the requested page is past the end', async () => {
		const accounts = ['user-a', 'user-m', 'user-z'].map((id, index) => ({
			id,
			email: `${id}@example.test`,
			createdAt: `2026-06-0${index + 1}T00:00:00.000Z`,
			lastSignInAt: null,
			emailConfirmedAt: null
		}));
		const sources = createInMemoryPlatformUserDirectorySources({ authUsers: accounts });
		const directory = createPlatformUserDirectory({ ...sources, personnel: createInMemoryPlatformMetricsStore({}) });

		const past = await directory.listUsers({ search: '', page: 7, limit: 2 });
		expect(past.users.map((user) => user.id)).toEqual(['user-a']);
		expect(past).toMatchObject({ page: 2, totalCount: 3 });

		const none = await directory.listUsers({ search: 'nobody', page: 3, limit: 2 });
		expect(none).toMatchObject({ users: [], page: 1, totalCount: 0 });
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

	it('shapes user detail memberships with roles and personnel counts', async () => {
		const directory = createSubject(
			{
				authUsers: [
					{
						id: 'user-1',
						email: 'commander@example.test',
						createdAt: '2026-06-01T00:00:00.000Z',
						lastSignInAt: '2026-06-08T00:00:00.000Z',
						emailConfirmedAt: '2026-06-01T00:05:00.000Z'
					}
				],
				memberships: [
					{
						userId: 'user-1',
						role: 'owner',
						organization: { id: 'org-a', name: 'Able Company' }
					},
					{
						userId: 'user-1',
						role: 'member',
						organization: { id: 'org-b', name: 'Bravo Company' }
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
					lastSignInAt: '2026-06-08T00:00:00.000Z',
					emailConfirmedAt: '2026-06-01T00:05:00.000Z',
					emailConfirmationStatus: 'confirmed'
				},
				organizations: [
					{
						id: 'org-a',
						name: 'Able Company',
						role: 'owner',
						personnelCount: 1
					},
					{
						id: 'org-b',
						name: 'Bravo Company',
						role: 'member',
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
					lastSignInAt: null,
					emailConfirmedAt: null
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
					lastSignInAt: null,
					emailConfirmedAt: null
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
					lastSignInAt: null,
					emailConfirmedAt: null
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

	it.each(['detail', 'directory'] as const)(
		'does not convert a failed %s suspension read to an unsuspended account',
		async (surface) => {
			const providerError = new Error('Synthetic suspension lookup unavailable');
			const baseSources = createInMemoryPlatformUserDirectorySources({
				authUsers: [
					{
						id: 'user-1',
						email: 'account@example.test',
						createdAt: '2026-06-01T00:00:00.000Z',
						lastSignInAt: null,
						emailConfirmedAt: null
					}
				]
			});
			const directory = createPlatformUserDirectory({
				...baseSources,
				identity: {
					...baseSources.identity,
					getSuspensionForUser: async () => {
						throw providerError;
					},
					listSuspendedUserIds: async () => {
						throw providerError;
					}
				},
				personnel: createInMemoryPlatformMetricsStore({})
			});
			const result =
				surface === 'detail'
					? directory.getUserDetail('user-1')
					: directory.listUsers({ search: '', page: 1, limit: 20 });
			await expect(result).rejects.toBe(providerError);
		}
	);
});
