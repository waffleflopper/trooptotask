import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createSupabaseSensitiveActionAuthorizer } from '$features/identity/index.server';
import type { SensitiveActionAuthorizer } from '$features/identity/contracts';
import {
	deleteOrganization,
	type OrganizationDestructionPort,
	type OrganizationCleanupFile
} from './destruction.server';

const orgA = '11111111-1111-4111-8111-111111111111';
const orgB = '22222222-2222-4222-8222-222222222222';

function fakeDestruction(options: { organizationName?: string | null } = {}) {
	const state = {
		owner: true,
		parentAcknowledged: true,
		failBatch: 0,
		batches: 0,
		afterRemoval: () => {},
		lookupFailure: false
	};
	const organizations = new Map<string, { name: string | null }>([
		[orgA, { name: options.organizationName === undefined ? 'Test Org' : options.organizationName }],
		[orgB, { name: 'Foreign Org' }]
	]);
	const files: OrganizationCleanupFile[] = [
		{ bucket: 'counseling-files', path: `${orgA}/orphan.pdf` },
		{ bucket: 'personnel-documents', path: `${orgA}/nested/document.pdf` },
		{ bucket: 'counseling-files', path: `${orgB}/foreign.pdf` }
	];
	const deletedOrganizations: string[] = [];
	const port: OrganizationDestructionPort = {
		async findTarget(id) {
			if (state.lookupFailure) throw new Error('private provider failure');
			return organizations.get(id) ?? null;
		},
		async hasCurrentCleanupAuthority(id) {
			return id === orgA && state.owner;
		},
		async discoverFiles(id) {
			return files.filter((file) => file.path.startsWith(`${id}/`));
		},
		async removeFiles(_id, bucket, paths) {
			state.batches++;
			if (state.batches === state.failBatch) throw new Error('private provider failure');
			for (let i = files.length - 1; i >= 0; i--)
				if (files[i].bucket === bucket && paths.includes(files[i].path)) files.splice(i, 1);
			state.afterRemoval();
		},
		async deleteConfirmedTarget(id, name) {
			if (!state.parentAcknowledged || !state.owner || organizations.get(id)?.name !== name) return false;
			organizations.delete(id);
			deletedOrganizations.push(id);
			return true;
		}
	};
	return Object.assign(port, { state, organizations, files, deletedOrganizations });
}

function setup() {
	const ctx = createTestContext({ auth: { orgId: orgA, userId: 'owner-1', role: 'owner' } });
	const detached = createTestContext();
	const destruction = fakeDestruction();
	const ports = {
		auth: ctx.auth,
		audit: ctx.audit,
		deletedAudit: detached.audit,
		destruction,
		sensitiveActionAuthorizer: ctx.sensitiveActionAuthorizer as SensitiveActionAuthorizer
	};
	return {
		ctx,
		destruction,
		ports,
		deletedAuditEvents: detached.auditPort.events,
		execute: () => deleteOrganization(ports, { confirmName: 'Test Org' })
	};
}

describe('Organization destruction', () => {
	it('removes every owned file before the exact parent, retains foreign facts and audits confirmed success', async () => {
		const { ctx, destruction, ports, deletedAuditEvents } = setup();
		destruction.organizations.set(orgA, { name: 'Test   Org' });
		await expect(deleteOrganization(ports, { confirmName: '  Test Org ' })).resolves.toEqual({ success: true });
		expect([...destruction.organizations]).toEqual([[orgB, { name: 'Foreign Org' }]]);
		expect(destruction.files).toEqual([{ bucket: 'counseling-files', path: `${orgB}/foreign.pdf` }]);
		expect(deletedAuditEvents).toContainEqual(
			expect.objectContaining({ action: 'org.deleted', resourceId: orgA, severity: 'critical' })
		);
		expect(ctx.auditPort.events.some((event) => event.action === 'org.deleted')).toBe(false);
	});
	it.each(['admin', 'member'] as const)('denies %s before any file or parent effects', async (role) => {
		const { ctx, ports, destruction } = setup();
		await expect(
			deleteOrganization({ ...ports, auth: { ...ports.auth, role } }, { confirmName: 'Test Org' })
		).rejects.toMatchObject({ status: 403 });
		expect(destruction.files).toHaveLength(3);
		expect(destruction.organizations.size).toBe(2);
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
	});
	it('rejects a mismatched name before assurance or effects', async () => {
		const { ctx, ports, destruction } = setup();
		await expect(deleteOrganization(ports, { confirmName: 'Other Org' })).rejects.toMatchObject({ status: 400 });
		expect(destruction.files).toHaveLength(3);
		expect(ctx.sensitiveActionAuthorizer.requests).toEqual([]);
	});
	it.each([null, '', '   '])('never admits a blank persisted target name (%s)', async (name) => {
		const { destruction, execute } = setup();
		destruction.organizations.set(orgA, { name });
		await expect(execute()).rejects.toMatchObject({ status: 404 });
		expect(destruction.files).toHaveLength(3);
	});
	it('fails closed on an unavailable provider without exposing its private error', async () => {
		const { destruction, execute } = setup();
		destruction.state.lookupFailure = true;
		await expect(execute()).rejects.toMatchObject({ status: 409 });
		await expect(execute()).rejects.not.toThrow('private provider failure');
		expect(destruction.files).toHaveLength(3);
	});
	it('does not trust the request role after persisted ownership changes', async () => {
		const { destruction, execute } = setup();
		destruction.state.owner = false;
		await expect(execute()).rejects.toMatchObject({ status: 403 });
		expect(destruction.files).toHaveLength(3);
	});
	it('stops between removal batches when ownership is revoked', async () => {
		const { destruction, execute, deletedAuditEvents } = setup();
		destruction.state.afterRemoval = () => {
			destruction.state.owner = false;
		};
		await expect(execute()).rejects.toMatchObject({ status: 403 });
		expect(destruction.files.map((file) => file.path)).toEqual([`${orgA}/nested/document.pdf`, `${orgB}/foreign.pdf`]);
		expect(destruction.organizations.has(orgA)).toBe(true);
		expect(deletedAuditEvents).toEqual([]);
	});
	it('keeps the parent on partial failure and permits an explicit retry of remaining files', async () => {
		const { destruction, execute } = setup();
		destruction.state.failBatch = 2;
		await expect(execute()).rejects.toMatchObject({ status: 409 });
		expect(destruction.files.map((file) => file.path)).toEqual([`${orgA}/nested/document.pdf`, `${orgB}/foreign.pdf`]);
		expect(destruction.organizations.has(orgA)).toBe(true);
		destruction.state.failBatch = 0;
		await expect(execute()).resolves.toEqual({ success: true });
		expect(destruction.files).toEqual([{ bucket: 'counseling-files', path: `${orgB}/foreign.pdf` }]);
	});
	it('does not delete the parent when a new file appears after the manifest', async () => {
		const { destruction, execute } = setup();
		destruction.state.afterRemoval = () => {
			destruction.files.push({ bucket: 'counseling-files', path: `${orgA}/new.pdf` });
		};
		await expect(execute()).rejects.toMatchObject({ status: 409 });
		expect(destruction.organizations.has(orgA)).toBe(true);
	});
	it('rechecks the saved name before further destructive effects', async () => {
		const { destruction, execute } = setup();
		destruction.state.afterRemoval = () => {
			destruction.organizations.set(orgA, { name: 'Renamed' });
		};
		await expect(execute()).rejects.toMatchObject({ status: 409 });
		expect(destruction.files.some((file) => file.path === `${orgA}/nested/document.pdf`)).toBe(true);
		expect(destruction.organizations.get(orgA)?.name).toBe('Renamed');
	});
	it('requires exact parent acknowledgement and emits no success audit for a zero-row delete', async () => {
		const { destruction, execute, deletedAuditEvents } = setup();
		destruction.state.parentAcknowledged = false;
		await expect(execute()).rejects.toMatchObject({ status: 409 });
		expect(destruction.organizations.has(orgA)).toBe(true);
		expect(deletedAuditEvents).toEqual([]);
	});
	it('removes a paged-size manifest in bounded batches without skipping files', async () => {
		const { destruction, execute } = setup();
		for (let n = 0; n < 1001; n++) destruction.files.push({ bucket: 'counseling-files', path: `${orgA}/${n}.pdf` });
		await execute();
		expect(destruction.files).toEqual([{ bucket: 'counseling-files', path: `${orgB}/foreign.pdf` }]);
	});
	it.each(['initial discovery', 'between removal batches', 'final discovery'] as const)(
		'stops destructive effects when password assurance expires during %s',
		async (phase) => {
			const { ctx, ports, destruction, deletedAuditEvents } = setup();
			let now = new Date('2026-05-22T12:00:00Z');
			ports.sensitiveActionAuthorizer = createSupabaseSensitiveActionAuthorizer({
				authenticatedUserId: 'owner-1',
				session: {
					access_token: 'verified-token',
					expires_at: 1779454800,
					user: { id: 'owner-1' }
				} as never,
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
								data: {
									currentLevel: 'aal1',
									nextLevel: 'aal1',
									currentAuthenticationMethods: [{ method: 'password', timestamp: 1779451140 }]
								},
								error: null
							})
						}
					},
					rpc: vi.fn().mockResolvedValue({ data: false, error: null })
				} as never,
				now: () => now
			});
			const expire = () => {
				now = new Date('2026-05-22T12:16:00Z');
			};
			const discover = destruction.discoverFiles;
			destruction.discoverFiles = async (id) => {
				const manifest = await discover(id);
				if ((phase === 'initial discovery' && manifest.length) || (phase === 'final discovery' && !manifest.length))
					expire();
				return manifest;
			};
			if (phase === 'between removal batches') destruction.state.afterRemoval = expire;
			await expect(deleteOrganization(ports, { confirmName: 'Test Org' })).rejects.toMatchObject({
				status: 403,
				reason: 'denied.staleSession',
				requiresStepUp: true
			});
			expect(destruction.organizations.has(orgA)).toBe(true);
			expect(destruction.files.map((file) => file.path)).toEqual(
				phase === 'initial discovery'
					? [`${orgA}/orphan.pdf`, `${orgA}/nested/document.pdf`, `${orgB}/foreign.pdf`]
					: phase === 'between removal batches'
						? [`${orgA}/nested/document.pdf`, `${orgB}/foreign.pdf`]
						: [`${orgB}/foreign.pdf`]
			);
			expect(deletedAuditEvents).toEqual([]);
			expect(ctx.auditPort.events).toContainEqual(
				expect.objectContaining({ action: 'org.delete_authorization_denied' })
			);
		}
	);
});
describe('Organization sensitive-action suspension admission', () => {
	it('blocks deletion effects until suspension is verifiably clear', async () => {
		const ctx = createTestContext({ auth: { userId: 'owner-1', orgId: orgA, role: 'owner' } });
		const administration = fakeDestruction({ organizationName: 'Test Org' });
		const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
		const ports = {
			auth: ctx.auth,
			audit: ctx.audit,
			deletedAudit: ctx.audit,
			destruction: administration,
			sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
				authenticatedUserId: 'owner-1',
				supabase: {
					auth: {
						mfa: {
							getAuthenticatorAssuranceLevel: vi
								.fn()
								.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null })
						}
					},
					rpc
				} as never,
				session: {
					access_token: 'verified-request-token',
					expires_at: 1779454800,
					user: { id: 'owner-1', last_sign_in_at: '2026-05-22T10:00:00Z' }
				} as never,
				now: () => new Date('2026-05-22T12:00:00Z')
			})
		};
		const execute = () => deleteOrganization(ports, { confirmName: 'Test Org' });

		await expect(execute()).rejects.toMatchObject({
			status: 403,
			reason: 'denied.suspensionStatusUnavailable',
			requiresStepUp: false,
			stepUpPath: null
		});
		expect(administration.deletedOrganizations).toEqual([]);
		expect(ctx.notificationPort.notifications).toEqual([]);
		expect(ctx.auditPort.events).toContainEqual(
			expect.objectContaining({
				details: expect.objectContaining({
					sensitiveAction: expect.objectContaining({ reason: 'denied.suspensionStatusUnavailable' })
				}),
				severity: 'warning'
			})
		);

		rpc.mockResolvedValue({ data: false, error: null });
		await expect(execute()).resolves.toEqual({ success: true });
		expect(administration.deletedOrganizations).toHaveLength(1);
	});
});

describe('Organization session denial effects', () => {
	it.each([
		['different actor', 'other-user', 1779454800, 'aal2', 'aal2', 'denied.unauthenticated'],
		['expired session', 'owner-1', 1779451200, 'aal2', 'aal2', 'denied.unauthenticated'],
		['MFA pending', 'owner-1', 1779454800, 'aal1', 'aal2', 'denied.staleSession'],
		['unavailable assurance', 'owner-1', 1779454800, null, null, 'denied.assuranceUnavailable']
	])(
		'preserves Organization on %s and permits a valid retry',
		async (_label, userId, expiresAt, currentLevel, nextLevel, reason) => {
			const ctx = createTestContext({ auth: { userId: 'owner-1', orgId: orgA, role: 'owner' } });
			const administration = fakeDestruction({ organizationName: 'Test Org' });
			const session = { access_token: 'verified-token', expires_at: expiresAt, user: { id: userId } };
			const assurance = vi.fn().mockResolvedValue({
				data: {
					currentLevel,
					nextLevel,
					currentAuthenticationMethods: [{ method: 'password', timestamp: 1779451140 }]
				},
				error: null
			});
			const ports = {
				auth: ctx.auth,
				audit: ctx.audit,
				deletedAudit: ctx.audit,
				destruction: administration,
				sensitiveActionAuthorizer: createSupabaseSensitiveActionAuthorizer({
					authenticatedUserId: 'owner-1',
					session: session as never,
					supabase: {
						auth: { mfa: { getAuthenticatorAssuranceLevel: assurance } },
						rpc: vi.fn().mockResolvedValue({ data: false, error: null })
					} as never,
					now: () => new Date('2026-05-22T12:00:00Z')
				})
			};
			const execute = () => deleteOrganization(ports, { confirmName: 'Test Org' });
			await expect(execute()).rejects.toMatchObject({ status: 403, reason });
			expect(administration.deletedOrganizations).toEqual([]);
			expect(ctx.notificationPort.notifications).toEqual([]);
			expect(ctx.auditPort.events.some((event) => event.action === 'org.deleted')).toBe(false);
			session.user.id = 'owner-1';
			session.expires_at = 1779454800;
			assurance.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' }, error: null });
			await expect(execute()).resolves.toEqual({ success: true });
			expect(administration.deletedOrganizations).toEqual([orgA]);
		}
	);
});
