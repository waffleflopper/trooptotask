import { describe, expect, it } from 'vitest';
import { createPlatformUserDirectory } from './userDirectory.server';
import type { PlatformUserDirectoryDependencies } from '../userDirectoryTypes';

const account = {
	id: 'user',
	email: 'synthetic@example.test',
	createdAt: '2026-10-01',
	lastSignInAt: null,
	emailConfirmedAt: null
};
const failed = async () => {
	throw new Error('support source unavailable');
};
function directory(failure: string) {
	const store: PlatformUserDirectoryDependencies['identity'] & PlatformUserDirectoryDependencies['organizations'] = {
		listAuthUsers: async () => ({ status: 'ok', users: [account] }),
		getAuthUser: async () => ({ status: 'ok', user: account }),
		listMembershipUserIds: failure === 'listMembershipUserIds' ? failed : async () => [],
		listMembershipsForUser:
			failure === 'listMembershipsForUser'
				? failed
				: async () => [{ userId: 'user', role: 'owner', organization: { id: 'able', name: 'Able' } }],
		listSuspendedUserIds: failure === 'listSuspendedUserIds' ? failed : async () => [],
		getSuspensionForUser: failure === 'getSuspensionForUser' ? failed : async () => null
	};
	return createPlatformUserDirectory({
		identity: store,
		organizations: store,
		personnel: { countActivePersonnelByOrganization: failure === 'personnel' ? failed : async () => new Map() }
	});
}
describe('required platform User facts unavailable', () => {
	it.each(['listMembershipUserIds', 'listSuspendedUserIds'])(
		'does not publish a list when %s fails',
		async (failure) => {
			await expect(directory(failure).listUsers({ search: '', page: 1, limit: 20 })).rejects.toThrow(
				'support source unavailable'
			);
		}
	);
	it.each(['listMembershipsForUser', 'getSuspensionForUser', 'personnel'])(
		'does not publish a detail when %s fails',
		async (failure) => {
			await expect(directory(failure).getUserDetail('user')).rejects.toThrow('support source unavailable');
		}
	);
});
