import { withPersonnelPersistence } from './personnelPersistence.test-support.server';
import { describe, it, expect, vi } from 'vitest';
import {
	createTestContext as basecreateTestContext,
	createWritePortsContext as basecreateWritePortsContext
} from '$lib/server/adapters/inMemory';

import {
	archivePersonnelRecord,
	restorePersonnelRecord,
	permanentlyDeletePersonnelRecord,
	approvePersonnelArchiveRequest
} from './personnelLifecycle.server';
const createWritePortsContext = (overrides?: Parameters<typeof basecreateWritePortsContext>[0]) =>
	withPersonnelPersistence(basecreateWritePortsContext(overrides));
const createTestContext = (overrides?: Parameters<typeof basecreateTestContext>[0]) =>
	withPersonnelPersistence(basecreateTestContext(overrides));
function buildContext(overrides?: Parameters<typeof createWritePortsContext>[0]) {
	return createWritePortsContext(overrides);
}

function deleteWithTestNotification(ctx: ReturnType<typeof createTestContext>, id: string) {
	return permanentlyDeletePersonnelRecord(ctx, id, () =>
		ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
			type: 'synthetic_notification',
			title: 'Synthetic notification',
			message: 'Synthetic notification'
		})
	);
}

describe('Personnel — archive', () => {
	function seedPersonnel(ctx: ReturnType<typeof buildContext>) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: null,
				organization_id: 'test-org'
			}
		]);
	}

	it('sets archived_at and audits', async () => {
		const ctx = buildContext();
		seedPersonnel(ctx);

		await archivePersonnelRecord(ctx, 'p-1');

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeTruthy();

		expect(ctx.audit.events[0]).toMatchObject({
			action: 'personnel.archived',
			resourceId: 'p-1'
		});
	});

	it.each([
		['rejects the command', new Error('Personnel archive failed')],
		['does not acknowledge the command', new Error('Personnel archive was not acknowledged')]
	])('reports no archive and does not retry when the database %s', async (_case, failure) => {
		const ctx = buildContext();
		seedPersonnel(ctx);
		const archive = vi.fn(async () => {
			throw failure;
		});
		ctx.personnelLifecycle.archive = archive;

		await expect(archivePersonnelRecord(ctx, 'p-1')).rejects.toThrow(failure.message);
		expect(archive).toHaveBeenCalledTimes(1);
		expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.archived' }));
		expect(await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })).toMatchObject({ archived_at: null });
	});

	it('returns requiresApproval for non-privileged, non-full-editor users', async () => {
		const ctx = buildContext({
			auth: {
				isPrivileged: false,
				role: 'member',
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}
		});
		seedPersonnel(ctx);

		const result = await archivePersonnelRecord(ctx, 'p-1');
		expect(result).toMatchObject({ requiresApproval: true });

		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeNull();
	});

	it('archives directly for a configure-capable member', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);

		const result = await archivePersonnelRecord(ctx, 'p-1');

		expect(result).toBeUndefined();
		const stored = (await ctx.store.findOne('personnel', 'test-org', { id: 'p-1' })) as Record<string, unknown>;
		expect(stored.archived_at).toBeTruthy();
	});

	it.each([null, '2026-08-01T12:00:00.000Z'])(
		'denies out-of-scope archive and replay without effects (%s)',
		async (archivedAt) => {
			const ctx = buildContext({
				auth: {
					scopeSet: { kind: 'groups', groupIds: ['group-a'] }
				}
			});
			seedPersonnel(ctx);
			await ctx.rawStore!.update('personnel', ctx.auth.orgId, 'p-1', { group_id: 'group-b', archived_at: archivedAt });
			const original = structuredClone(await ctx.rawStore!.findOne('personnel', ctx.auth.orgId, { id: 'p-1' }));
			const archive = vi.spyOn(ctx.personnelLifecycle, 'archive');

			await expect(archivePersonnelRecord(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
			expect(archive).not.toHaveBeenCalled();
			expect(await ctx.rawStore!.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).toEqual(original);
			expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.archived' }));
		}
	);
});

describe('Personnel — restore', () => {
	function seedArchivedPersonnel(ctx: ReturnType<typeof buildContext>, overrides: Record<string, unknown> = {}) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: '2026-04-01T00:00:00Z',
				organization_id: ctx.auth.orgId,
				...overrides
			}
		]);
	}

	it('restores the Person and audits the saved identity', async () => {
		const ctx = buildContext();
		seedArchivedPersonnel(ctx);

		const result = await restorePersonnelRecord(ctx, 'p-1');

		expect(result).toEqual({ success: true });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: null
		});
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'personnel.restored',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: { name: 'SGT Smith, Jamie' }
			})
		);
	});

	it('reports a Person restored by another request as not archived without a success audit', async () => {
		const ctx = buildContext();
		seedArchivedPersonnel(ctx);
		ctx.personnelLifecycle.restore = async () => false;

		await expect(restorePersonnelRecord(ctx, 'p-1')).rejects.toMatchObject({
			status: 400,
			message: 'Personnel is not archived'
		});
		expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.restored' }));
	});

	it.each([
		['rejects the command', new Error('Personnel restore failed')],
		['does not acknowledge the command', new Error('Personnel restore was not acknowledged')]
	])('reports no restore and does not retry when the database %s', async (_case, failure) => {
		const ctx = buildContext();
		seedArchivedPersonnel(ctx);
		const restore = vi.fn(async () => {
			throw failure;
		});
		ctx.personnelLifecycle.restore = restore;

		await expect(restorePersonnelRecord(ctx, 'p-1')).rejects.toThrow(failure.message);
		expect(restore).toHaveBeenCalledTimes(1);
		expect(ctx.audit.events).not.toContainEqual(expect.objectContaining({ action: 'personnel.restored' }));
	});

	it('rejects restore when the personnel record is missing', async () => {
		const ctx = buildContext();

		await expect(restorePersonnelRecord(ctx, 'p-missing')).rejects.toMatchObject({ status: 404 });
	});

	it('rejects restore when the personnel record is not archived', async () => {
		const ctx = buildContext();
		seedArchivedPersonnel(ctx, { archived_at: null });

		await expect(restorePersonnelRecord(ctx, 'p-1')).rejects.toMatchObject({ status: 400 });
	});

	it('authorizes restore before returning archive-state errors', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		seedArchivedPersonnel(ctx, { archived_at: null, group_id: 'group-b' });

		await expect(restorePersonnelRecord(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.restoreRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});

	it('enforces group scope using the archived personnel row group', async () => {
		const ctx = buildContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		seedArchivedPersonnel(ctx, { group_id: 'group-b' });

		await expect(restorePersonnelRecord(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		expect(ctx.audit.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.restoreRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});
});

describe('Personnel — permanent delete', () => {
	function seedPersonnel(ctx: ReturnType<typeof createTestContext>, overrides: Record<string, unknown> = {}) {
		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '11B',
				clinic_role: 'Team Leader',
				group_id: null,
				archived_at: '2026-04-01T00:00:00Z',
				organization_id: ctx.auth.orgId,
				...overrides
			}
		]);
	}

	it('deletes archived personnel, audits, and supplies its saved name to delivery', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx);

		const notify = vi.fn(async (_name: string) => {});
		const result = await permanentlyDeletePersonnelRecord(ctx, 'p-1', notify);

		expect(result).toEqual({ success: true });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toBeNull();
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'personnel.permanently_deleted',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: { name: 'SGT Smith, Jamie' }
			})
		);
		expect(notify).toHaveBeenCalledWith('SGT Smith, Jamie');
	});

	it.each(['resolve', 'reject'] as const)(
		'persists deletion and audit before waiting for administrator notification to %s',
		async (completion) => {
			const ctx = createTestContext();
			seedPersonnel(ctx);
			let startNotification!: () => void;
			const notificationStarted = new Promise<void>((resolve) => {
				startNotification = resolve;
			});
			let releaseNotification!: () => void;
			let rejectNotification!: (reason: Error) => void;
			const notificationPending = new Promise<void>((resolve, reject) => {
				releaseNotification = resolve;
				rejectNotification = reject;
			});
			let atNotification: { person: unknown; auditEvents: typeof ctx.auditPort.events } | undefined;
			const notifyAdmins = ctx.notifications.notifyAdmins.bind(ctx.notifications);
			ctx.notifications.notifyAdmins = async (...args) => {
				atNotification = {
					person: structuredClone(await ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })),
					auditEvents: structuredClone(ctx.auditPort.events)
				};
				startNotification();
				await notificationPending;
				await notifyAdmins(...args);
			};

			let settled = false;
			const deletion = deleteWithTestNotification(ctx, 'p-1');
			void deletion.then(
				() => {
					settled = true;
				},
				() => {
					settled = true;
				}
			);
			await notificationStarted;
			await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toBeNull();
			expect(atNotification?.person).toBeNull();
			expect(atNotification?.auditEvents).toContainEqual(
				expect.objectContaining({ action: 'personnel.permanently_deleted', resourceId: 'p-1' })
			);
			expect(settled).toBe(false);

			if (completion === 'resolve') {
				releaseNotification();
				await expect(deletion).resolves.toEqual({ success: true });
			} else {
				const failure = new Error('administrator notification interrupted');
				rejectNotification(failure);
				await expect(deletion).rejects.toThrow('administrator notification interrupted');
			}
			await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toBeNull();
			expect(ctx.auditPort.events).toContainEqual(
				expect.objectContaining({ action: 'personnel.permanently_deleted', resourceId: 'p-1' })
			);
		}
	);

	it('rejects permanent delete when id is missing', async () => {
		const ctx = createTestContext();

		await expect(deleteWithTestNotification(ctx, '')).rejects.toMatchObject({ status: 400 });
	});

	it('rejects permanent delete when the personnel record is missing', async () => {
		const ctx = createTestContext();

		await expect(deleteWithTestNotification(ctx, 'p-missing')).rejects.toMatchObject({ status: 404 });
	});

	it('rejects permanent delete for active personnel', async () => {
		const ctx = createTestContext();
		seedPersonnel(ctx, { archived_at: null });

		await expect(deleteWithTestNotification(ctx, 'p-1')).rejects.toMatchObject({ status: 400 });
		await expect(ctx.store.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: null
		});
	});

	it('authorizes permanent delete before returning archive-state errors', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		seedPersonnel(ctx, { archived_at: null, group_id: 'group-b' });

		await expect(deleteWithTestNotification(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: null
		});
		expect(ctx.notificationPort.notifications).toHaveLength(0);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.permanentlyDeleteRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});

	it('enforces group scope using the archived personnel row group', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: ['group-a'] }
			}
		});
		seedPersonnel(ctx, { group_id: 'group-b' });

		await expect(deleteWithTestNotification(ctx, 'p-1')).rejects.toMatchObject({ status: 403 });
		await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: 'p-1' })).resolves.toMatchObject({
			archived_at: '2026-04-01T00:00:00Z'
		});
		expect(ctx.notificationPort.notifications).toHaveLength(0);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'personnel',
				resourceId: 'p-1',
				details: expect.objectContaining({
					policyAction: 'personnel.permanentlyDeleteRecords',
					reasonCode: 'denied:out-of-scope'
				})
			})
		);
	});
});

describe('Personnel — approved archive request', () => {
	it('rejects an ordinary Personnel configurator before the approval command', async () => {
		const ctx = createTestContext({ auth: { role: 'member', isPrivileged: false } });
		const person = { id: 'approved-person', organization_id: ctx.auth.orgId, group_id: null, archived_at: null };
		ctx.rawStore.seed('personnel', [structuredClone(person)]);
		const approve = vi.spyOn(ctx.personnelLifecycle, 'approveArchiveRequest');
		await expect(
			approvePersonnelArchiveRequest(ctx, 'request-1', person.id, '2026-10-01T12:00:00.000Z')
		).rejects.toMatchObject({ status: 403 });
		expect(approve).not.toHaveBeenCalled();
		await expect(ctx.rawStore.findOne('personnel', ctx.auth.orgId, { id: person.id })).resolves.toEqual(person);
	});
});
