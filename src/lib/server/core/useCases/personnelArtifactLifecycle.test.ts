import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { PersonnelArtifactSpec } from './personnelArtifactLifecycle';
import {
	archiveArtifact,
	deleteArtifact,
	listArtifacts,
	loadArtifact,
	requirePersonnelArtifactReadAccess,
	restoreArtifact
} from './personnelArtifactLifecycle';

interface TestArtifactRow {
	id: string;
	personnel_id: string;
	contributor: string;
	title: string;
	created_at: string;
	archived_at?: string | null;
	status?: 'open' | 'archived';
}

interface TestArtifactDto {
	id: string;
	contributor: string;
	title: string;
	archivedAt: string | null;
}

const TEST_SPEC: PersonnelArtifactSpec<TestArtifactRow, TestArtifactDto> = {
	table: 'test_artifacts',
	noun: 'Test artifact',
	nounPlural: 'test artifacts',
	auditPrefix: 'personnel.test_artifact',
	contributorColumn: 'contributor',
	map: (row, labels) => ({
		id: row.id,
		contributor: labels.get(row.contributor) ?? row.contributor,
		title: row.title,
		archivedAt: row.archived_at ?? null
	}),
	isArchived: (row) => !!row.archived_at,
	listClause: ({ archived, limit }, personnelId) => ({
		filters: { personnel_id: personnelId },
		isNull: { archived_at: !archived },
		orderBy: [{ column: 'created_at', ascending: false }],
		limit
	}),
	archivePatch: (now) => ({ archived_at: now }),
	restorePatch: () => ({ archived_at: null })
};

const STATUS_SPEC: PersonnelArtifactSpec<TestArtifactRow, TestArtifactDto> = {
	...TEST_SPEC,
	table: 'status_artifacts',
	noun: 'Status artifact',
	nounPlural: 'status artifacts',
	auditPrefix: 'personnel.status_artifact',
	isArchived: (row) => row.status === 'archived'
};

function configureContext() {
	const ctx = createTestContext({
		auth: {
			capabilityMap: {
				calendar: 'view',
				personnel: 'configure',
				training: 'view',
				criticalTasks: 'view',
				onboarding: 'view',
				ratingScheme: 'view'
			},
			scopeSet: { kind: 'organization' }
		},
		scope: {
			requireGroupAccess: vi.fn(async () => {})
		}
	});
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
	return ctx;
}

function seedRows(ctx: ReturnType<typeof configureContext>) {
	ctx.store.seed('organization_memberships', [
		{
			id: 'membership-1',
			organization_id: ctx.auth.orgId,
			user_id: '11111111-1111-4111-8111-111111111111',
			display_name: 'SSG Rivera'
		}
	]);
	ctx.store.seed('test_artifacts', [
		{
			id: 'active-old',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			contributor: 'Free text leader',
			title: 'Old active',
			created_at: '2026-05-01T00:00:00Z',
			archived_at: null
		},
		{
			id: 'active-new',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			contributor: '11111111-1111-4111-8111-111111111111',
			title: 'New active',
			created_at: '2026-05-02T00:00:00Z',
			archived_at: null
		},
		{
			id: 'archived',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			contributor: '11111111-1111-4111-8111-111111111111',
			title: 'Archived',
			created_at: '2026-05-03T00:00:00Z',
			archived_at: '2026-05-04T00:00:00Z'
		}
	]);
	ctx.store.seed('status_artifacts', [
		{
			id: 'status-active',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			contributor: 'Free text leader',
			title: 'Status active',
			created_at: '2026-05-01T00:00:00Z',
			status: 'open'
		}
	]);
}

describe('personnel artifact lifecycle', () => {
	it('lists through the spec clause, requires read access, hydrates contributor labels, and maps rows', async () => {
		const ctx = configureContext();
		seedRows(ctx);

		const rows = await listArtifacts(ctx, TEST_SPEC, 'person-1', { limit: 1 });

		expect(rows).toEqual([
			{
				id: 'active-new',
				contributor: 'SSG Rivera',
				title: 'New active',
				archivedAt: null
			}
		]);
		expect(ctx.scope.requireGroupAccess).toHaveBeenCalledWith('person-1');
	});

	it('loads write-scoped rows by artifact id and personnel id and returns the existing 404 string', async () => {
		const ctx = configureContext();
		seedRows(ctx);

		await expect(loadArtifact(ctx, TEST_SPEC, 'person-1', 'missing')).rejects.toMatchObject({
			status: 404,
			message: 'Test artifact not found'
		});
	});

	it('archives and restores binary artifacts with exact guard and audit semantics', async () => {
		const ctx = configureContext();
		seedRows(ctx);

		await expect(archiveArtifact(ctx, TEST_SPEC, { personnelId: 'person-1', id: 'archived' })).rejects.toMatchObject({
			status: 409,
			message: 'Test artifact is already archived'
		});

		const archived = await archiveArtifact(ctx, TEST_SPEC, { personnelId: 'person-1', id: 'active-new' });
		expect(archived.archivedAt).toEqual(expect.any(String));
		expect(ctx.auditPort.events.at(-1)).toMatchObject({ action: 'personnel.test_artifact.archived' });

		const restored = await restoreArtifact(ctx, TEST_SPEC, { personnelId: 'person-1', id: 'active-new' });
		expect(restored.archivedAt).toBeNull();
		expect(ctx.auditPort.events.at(-1)).toMatchObject({ action: 'personnel.test_artifact.restored' });
	});

	it('deletes only archived artifacts and runs row cleanup after delete but before audit', async () => {
		const ctx = configureContext();
		seedRows(ctx);
		const calls: string[] = [];
		const deleteRow: typeof ctx.store.delete = ctx.store.delete.bind(ctx.store);
		ctx.store.delete = vi.fn(async (table, orgId, id) => {
			await deleteRow(table, orgId, id);
			calls.push('delete');
		}) as typeof ctx.store.delete;
		ctx.audit.log = vi.fn((event) => {
			calls.push(`audit:${event.action}`);
			ctx.auditPort.events.push(event);
		});

		await expect(deleteArtifact(ctx, TEST_SPEC, { personnelId: 'person-1', id: 'active-new' })).rejects.toMatchObject({
			status: 409,
			message: 'Archive test artifacts before deleting them'
		});

		await deleteArtifact(
			ctx,
			TEST_SPEC,
			{ personnelId: 'person-1', id: 'archived' },
			{
				onDeleted: async () => {
					calls.push('cleanup');
				}
			}
		);

		await expect(loadArtifact(ctx, TEST_SPEC, 'person-1', 'archived')).rejects.toMatchObject({ status: 404 });
		expect(calls).toEqual(['delete', 'cleanup', 'audit:personnel.test_artifact.deleted']);
	});

	it('uses the spec archive predicate for status-backed artifacts', async () => {
		const ctx = configureContext();
		seedRows(ctx);

		await expect(
			deleteArtifact(ctx, STATUS_SPEC, { personnelId: 'person-1', id: 'status-active' })
		).rejects.toMatchObject({
			status: 409,
			message: 'Archive status artifacts before deleting them'
		});
	});

	it('caches the shared Personnel access check per context, personnel, and access type', async () => {
		const ctx = configureContext();
		const findOne = ctx.rawStore.findOne.bind(ctx.rawStore);
		const findOneSpy = vi.fn(findOne);
		ctx.rawStore.findOne = findOneSpy as unknown as typeof ctx.rawStore.findOne;

		await Promise.all([
			requirePersonnelArtifactReadAccess(ctx, 'person-1'),
			listArtifacts(ctx, TEST_SPEC, 'person-1'),
			listArtifacts(ctx, TEST_SPEC, 'person-1')
		]);

		expect(findOneSpy.mock.calls.filter(([table]) => table === 'personnel')).toHaveLength(1);
		expect(ctx.scope.requireGroupAccess).toHaveBeenCalledTimes(1);
	});

	it('keeps group-scope rejection inside the shared lifecycle access check', async () => {
		const ctx = configureContext();
		ctx.scope.requireGroupAccess = vi.fn(async () => {
			const error = new Error('Group access denied') as Error & { status?: number };
			error.status = 403;
			throw error;
		});

		await expect(listArtifacts(ctx, TEST_SPEC, 'person-1')).rejects.toMatchObject({ status: 403 });
	});

	it('rejects artifact reads when the caller lacks Personnel configure capability', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			},
			scope: {
				requireGroupAccess: vi.fn(async () => {})
			}
		});
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);

		await expect(listArtifacts(ctx, TEST_SPEC, 'person-1')).rejects.toMatchObject({ status: 403 });
		expect(ctx.scope.requireGroupAccess).not.toHaveBeenCalled();
	});
});
