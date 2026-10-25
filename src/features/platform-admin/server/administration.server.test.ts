import { describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '$lib/audit/contracts';
import type { PlatformSupportAdministrationDependencies } from '../administrationTypes';
import { createPlatformSupportAdministration } from './administration.server';

const USER = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-06-01T12:00:00Z');

function sources(): PlatformSupportAdministrationDependencies {
	return {
		identity: { searchUsersByEmail: vi.fn(async () => [{ id: USER, email: 'leader@example.test' }]) },
		organizations: {
			searchOrganizationsByName: vi.fn(async () => [{ id: ORG, name: 'Alpha Company' }]),
			listMembershipUserIds: vi.fn(async () => [USER, USER])
		},
		personnel: { countActivePersonnelByOrganization: vi.fn(async () => new Map([[ORG, 42]])) },
		userSuspensionCommands: { suspendUser: vi.fn(async () => {}), unsuspendUser: vi.fn(async () => {}) },
		organizationSuspensionCommands: {
			suspendOrganization: vi.fn(async () => 'suspended' as const),
			unsuspendOrganization: vi.fn(async () => {})
		},
		actorUserId: 'admitted-admin',
		sensitiveActionAuthorizer: {
			authorize: async ({ action, actorUserId, target }) => ({
				action,
				actorUserId,
				target,
				allowed: true,
				reason: 'allowed.mfaAssurance',
				currentAssuranceLevel: 'aal2',
				nextAssuranceLevel: 'aal2',
				sessionAgeMs: 0,
				recentSessionWindowMs: 600000,
				requiresStepUp: false
			})
		},
		audit: { log: vi.fn(async () => {}) },
		now: () => NOW
	};
}

describe('Platform support search', () => {
	it.each(['ab', '  a  ', ''])('does not read private facts for an insufficient query: %j', async (query) => {
		const deps = sources();
		await expect(createPlatformSupportAdministration(deps).search({ query })).resolves.toEqual({
			users: [],
			organizations: []
		});
		expect(deps.identity.searchUsersByEmail).not.toHaveBeenCalled();
		expect(deps.organizations.searchOrganizationsByName).not.toHaveBeenCalled();
		expect(deps.organizations.listMembershipUserIds).not.toHaveBeenCalled();
		expect(deps.personnel.countActivePersonnelByOrganization).not.toHaveBeenCalled();
	});

	it('normalizes search input and enriches retained User and Organization results', async () => {
		const deps = sources();
		const result = await createPlatformSupportAdministration(deps).search({ query: '  alpha   company  ' });
		expect(deps.identity.searchUsersByEmail).toHaveBeenCalledWith({ query: 'alpha company', maxResults: 5 });
		expect(deps.organizations.searchOrganizationsByName).toHaveBeenCalledWith({
			query: 'alpha company',
			maxResults: 5
		});
		expect(result).toEqual({
			users: [{ id: USER, email: 'leader@example.test', orgCount: 2 }],
			organizations: [{ id: ORG, name: 'Alpha Company', personnelCount: 42 }]
		});
	});

	it('caps the source query at 100 characters', async () => {
		const deps = sources();
		await createPlatformSupportAdministration(deps).search({ query: `${'a'.repeat(100)}extra` });
		expect(deps.identity.searchUsersByEmail).toHaveBeenCalledWith({ query: 'a'.repeat(100), maxResults: 5 });
	});

	it('uses one batch per source for all matched results, including legitimate empty counts', async () => {
		const deps = sources();
		deps.identity.searchUsersByEmail = vi.fn(async () => [
			{ id: USER, email: 'owner@example.test' },
			{ id: 'member', email: 'member@example.test' },
			{ id: 'new', email: null }
		]);
		deps.organizations.searchOrganizationsByName = vi.fn(async () => [
			{ id: ORG, name: 'Alpha' },
			{ id: 'small', name: 'Small' },
			{ id: 'empty', name: 'Empty' }
		]);
		deps.organizations.listMembershipUserIds = vi.fn(async () => [USER, USER, 'member']);
		deps.personnel.countActivePersonnelByOrganization = vi.fn(
			async () =>
				new Map([
					[ORG, 42],
					['small', 1]
				])
		);
		await expect(createPlatformSupportAdministration(deps).search({ query: 'company' })).resolves.toEqual({
			users: [
				{ id: USER, email: 'owner@example.test', orgCount: 2 },
				{ id: 'member', email: 'member@example.test', orgCount: 1 },
				{ id: 'new', email: '', orgCount: 0 }
			],
			organizations: [
				{ id: ORG, name: 'Alpha', personnelCount: 42 },
				{ id: 'small', name: 'Small', personnelCount: 1 },
				{ id: 'empty', name: 'Empty', personnelCount: 0 }
			]
		});
		expect(deps.organizations.listMembershipUserIds).toHaveBeenCalledTimes(1);
		expect(deps.organizations.listMembershipUserIds).toHaveBeenCalledWith([USER, 'member', 'new']);
		expect(deps.personnel.countActivePersonnelByOrganization).toHaveBeenCalledTimes(1);
		expect(deps.personnel.countActivePersonnelByOrganization).toHaveBeenCalledWith([ORG, 'small', 'empty']);
	});

	it('does not request aggregate facts when neither source matches', async () => {
		const deps = sources();
		deps.identity.searchUsersByEmail = vi.fn(async () => []);
		deps.organizations.searchOrganizationsByName = vi.fn(async () => []);
		await expect(createPlatformSupportAdministration(deps).search({ query: 'absent' })).resolves.toEqual({
			users: [],
			organizations: []
		});
		expect(deps.organizations.listMembershipUserIds).not.toHaveBeenCalled();
		expect(deps.personnel.countActivePersonnelByOrganization).not.toHaveBeenCalled();
	});

	it.each(['identity', 'organizations', 'memberships', 'personnel'] as const)(
		'does not publish partial or false-zero results after a failed %s source',
		async (source) => {
			const deps = sources();
			const failed = async () => {
				throw new Error('Source unavailable');
			};
			if (source === 'identity') deps.identity.searchUsersByEmail = failed;
			if (source === 'organizations') deps.organizations.searchOrganizationsByName = failed;
			if (source === 'memberships') deps.organizations.listMembershipUserIds = failed;
			if (source === 'personnel') deps.personnel.countActivePersonnelByOrganization = failed;
			await expect(createPlatformSupportAdministration(deps).search({ query: 'company' })).rejects.toThrow(
				'Source unavailable'
			);
		}
	);
});

describe('Platform suspension policy', () => {
	it.each([
		['user', 'suspend', 'suspendUser'],
		['user', 'unsuspend', 'unsuspendUser'],
		['org', 'suspend', 'suspendOrganization'],
		['org', 'unsuspend', 'unsuspendOrganization']
	] as const)('acknowledges %s %s before emitting its critical audit event', async (type, action, operation) => {
		const deps = sources();
		const targetId = type === 'user' ? USER : ORG;
		const changes: string[] = [];
		const events: AuditEvent[] = [];
		const acknowledged = vi.fn(async (..._input: unknown[]) => {
			changes.push(`${action}:${targetId}`);
			return 'suspended' as const;
		});
		if (type === 'user')
			deps.userSuspensionCommands[operation as 'suspendUser' | 'unsuspendUser'] = acknowledged as never;
		else
			deps.organizationSuspensionCommands[operation as 'suspendOrganization' | 'unsuspendOrganization'] =
				acknowledged as never;
		deps.audit = {
			async log(event) {
				expect(changes).toEqual([`${action}:${targetId}`]);
				events.push(event);
			}
		};
		await expect(
			createPlatformSupportAdministration(deps).updateSuspension({ type, action, targetId, reason: ' Policy review ' })
		).resolves.toEqual({ status: 'updated', success: true });
		expect(events).toEqual([
			{
				action: `${action}_${type}`,
				resourceType: type === 'user' ? 'user' : 'organization',
				resourceId: targetId,
				details: type === 'user' ? { reason: 'Policy review' } : {},
				severity: 'critical'
			}
		]);
		if (operation === 'suspendUser')
			expect(acknowledged).toHaveBeenCalledWith({
				userId: USER,
				suspendedBy: 'admitted-admin',
				reason: 'Policy review'
			});
		else if (operation === 'suspendOrganization')
			expect(acknowledged).toHaveBeenCalledWith({
				organizationId: ORG,
				suspendedBy: 'admitted-admin',
				reason: 'Policy review',
				suspendedAt: NOW
			});
		else if (operation === 'unsuspendOrganization')
			expect(acknowledged).toHaveBeenCalledWith({ organizationId: ORG, unsuspendedBy: 'admitted-admin' });
		else expect(acknowledged).toHaveBeenCalledWith(targetId);
	});

	it('reports a repeat Organization suspension as already suspended without a second audit event', async () => {
		const deps = sources();
		deps.organizationSuspensionCommands.suspendOrganization = vi.fn(async () => 'already_suspended' as const);
		await expect(
			createPlatformSupportAdministration(deps).updateSuspension({
				type: 'org',
				targetId: ORG,
				action: 'suspend',
				reason: 'Second request'
			})
		).resolves.toEqual({ status: 'already_suspended' });
		expect(deps.audit.log).not.toHaveBeenCalled();
	});

	it('keeps the reason out of an Organization audit event', async () => {
		const deps = sources();
		await createPlatformSupportAdministration(deps).updateSuspension({
			type: 'org',
			targetId: ORG,
			action: 'unsuspend',
			reason: '  '
		});
		expect(deps.audit.log).toHaveBeenCalledWith({
			action: 'unsuspend_org',
			resourceType: 'organization',
			resourceId: ORG,
			details: {},
			severity: 'critical'
		});
	});

	it('does not emit a success audit before an asynchronous source acknowledgement', async () => {
		const deps = sources();
		let acknowledge!: () => void;
		let sourceStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			sourceStarted = resolve;
		});
		deps.userSuspensionCommands.suspendUser = () =>
			new Promise<void>((resolve) => {
				acknowledge = resolve;
				sourceStarted();
			});
		const pending = createPlatformSupportAdministration(deps).updateSuspension({
			type: 'user',
			targetId: USER,
			action: 'suspend'
		});
		expect(deps.audit.log).not.toHaveBeenCalled();
		await started;
		acknowledge();
		await expect(pending).resolves.toEqual({ status: 'updated', success: true });
		expect(deps.audit.log).toHaveBeenCalledTimes(1);
	});

	it.each(['user_suspend', 'user_unsuspend', 'org_suspend', 'org_unsuspend'] as const)(
		'does not audit or report success after an unacknowledged %s effect',
		async (scenario) => {
			const deps = sources();
			const failed = async () => {
				throw new Error('Suspension change could not be confirmed');
			};
			deps.userSuspensionCommands = { suspendUser: failed, unsuspendUser: failed };
			deps.organizationSuspensionCommands = { suspendOrganization: failed, unsuspendOrganization: failed };
			const [type, action] = scenario.split('_');
			await expect(
				createPlatformSupportAdministration(deps).updateSuspension({
					type,
					action,
					targetId: type === 'user' ? USER : ORG,
					reason: 'Synthetic reason'
				})
			).rejects.toThrow('could not be confirmed');
			expect(deps.audit.log).not.toHaveBeenCalled();
		}
	);

	it.each([
		null,
		12,
		[],
		{},
		{ type: 'unknown', targetId: USER, action: 'suspend' },
		{ type: 'user', targetId: 'not-a-uuid', action: 'suspend' },
		{ type: 'org', targetId: [ORG], action: 'suspend' },
		{ type: 'user', targetId: USER, action: 'unknown' },
		...[null, 12, {}, []].map((reason) => ({ type: 'user', targetId: USER, action: 'suspend', reason })),
		...[undefined, '', '   '].map((reason) => ({ type: 'org', targetId: ORG, action: 'suspend', reason })),
		{ type: 'org', targetId: ORG, action: 'suspend', reason: 'x'.repeat(501) }
	])('rejects invalid input with a portable result before any effect or audit: %j', async (input) => {
		const deps = sources();
		await expect(createPlatformSupportAdministration(deps).updateSuspension(input)).resolves.toMatchObject({
			status: 'invalid_input'
		});
		expect(deps.userSuspensionCommands.suspendUser).not.toHaveBeenCalled();
		expect(deps.userSuspensionCommands.unsuspendUser).not.toHaveBeenCalled();
		expect(deps.organizationSuspensionCommands.suspendOrganization).not.toHaveBeenCalled();
		expect(deps.organizationSuspensionCommands.unsuspendOrganization).not.toHaveBeenCalled();
		expect(deps.audit.log).not.toHaveBeenCalled();
	});
});

it('fails the suspension command when its audit rejects', async () => {
	const deps = sources();
	deps.audit.log = async () => {
		throw new Error('Audit unavailable');
	};
	await expect(
		createPlatformSupportAdministration(deps).updateSuspension({ type: 'user', targetId: USER, action: 'suspend' })
	).rejects.toThrow('Audit unavailable');
});
