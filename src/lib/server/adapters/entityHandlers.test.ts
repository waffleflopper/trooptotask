import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { field, defineEntity } from '$lib/server/entitySchema';
import { createTestContext } from './inMemory';
import { handleUseCaseRequest } from './httpAdapter';
import { entityHandlers } from './httpAdapter';

// A simple test entity with full metadata
function createTestEntity(overrides?: { methods?: ('POST' | 'PUT' | 'DELETE')[] }) {
	return defineEntity({
		table: 'widgets',
		groupScope: 'none',
		schema: {
			id: field(z.string(), { readOnly: true }),
			name: field(z.string()),
			color: field(z.string(), { insertDefault: 'blue' })
		},
		permission: 'training',
		requireFullEditor: true,
		audit: 'widget',
		methods: overrides?.methods ?? ['POST', 'PUT', 'DELETE']
	});
}

describe('entityHandlers()', () => {
	describe('POST creates a record', () => {
		it('validates input, inserts into store, and audits', async () => {
			const entity = createTestEntity();
			const handlers = entityHandlers(entity);
			const ctx = createTestContext();

			await handleUseCaseRequest(handlers._configs.POST!, ctx, {
				name: 'Sprocket'
			});

			const rows = await ctx.store.findMany('widgets', 'test-org');
			expect(rows).toHaveLength(1);
			expect((rows[0] as Record<string, unknown>).name).toBe('Sprocket');
			expect((rows[0] as Record<string, unknown>).color).toBe('blue');

			expect(ctx.auditPort.events).toHaveLength(1);
			expect(ctx.auditPort.events[0].action).toBe('widget.created');
			expect(ctx.auditPort.events[0].resourceType).toBe('widget');
		});

		it('returns a 400 when entity schema validation fails', async () => {
			const entity = createTestEntity();
			const handlers = entityHandlers(entity);
			const ctx = createTestContext();

			await expect(handleUseCaseRequest(handlers._configs.POST!, ctx, {})).rejects.toMatchObject({
				status: 400
			});
		});
	});

	describe('PUT updates a record', () => {
		it('validates input, updates the store, and audits', async () => {
			const entity = createTestEntity();
			const handlers = entityHandlers(entity);
			const ctx = createTestContext();

			// Seed a record
			const inserted = await ctx.store.insert<{ id: string }>('widgets', 'test-org', {
				name: 'OldName',
				color: 'red'
			});

			await handleUseCaseRequest(handlers._configs.PUT!, ctx, {
				id: inserted.id,
				name: 'NewName'
			});

			const updated = await ctx.store.findOne<Record<string, unknown>>('widgets', 'test-org', {
				id: inserted.id
			});
			expect(updated!.name).toBe('NewName');

			expect(ctx.auditPort.events).toHaveLength(1);
			expect(ctx.auditPort.events[0].action).toBe('widget.updated');
		});

		it('returns a 400 when update payload validation fails', async () => {
			const entity = createTestEntity();
			const handlers = entityHandlers(entity);
			const ctx = createTestContext();

			await expect(handleUseCaseRequest(handlers._configs.PUT!, ctx, {})).rejects.toMatchObject({
				status: 400
			});
		});
	});

	describe('DELETE removes a record', () => {
		it('deletes from store and audits', async () => {
			const entity = createTestEntity();
			const handlers = entityHandlers(entity);
			const ctx = createTestContext();

			const inserted = await ctx.store.insert<{ id: string }>('widgets', 'test-org', {
				name: 'Doomed',
				color: 'black'
			});

			await handleUseCaseRequest(handlers._configs.DELETE!, ctx, {
				id: inserted.id
			});

			const rows = await ctx.store.findMany('widgets', 'test-org');
			expect(rows).toHaveLength(0);

			expect(ctx.auditPort.events).toHaveLength(1);
			expect(ctx.auditPort.events[0].action).toBe('widget.deleted');
		});
	});

	describe('method awareness', () => {
		it('only returns handlers for declared methods', () => {
			const entity = createTestEntity({ methods: ['POST'] });
			const handlers = entityHandlers(entity);

			expect(handlers.POST).toBeDefined();
			expect(handlers._configs.POST).toBeDefined();
			expect(handlers.PUT).toBeUndefined();
			expect(handlers._configs.PUT).toBeUndefined();
			expect(handlers.DELETE).toBeUndefined();
			expect(handlers._configs.DELETE).toBeUndefined();
		});
	});

	describe('delete hooks', () => {
		it('fires beforeDelete hook before deletion', async () => {
			const entity = createTestEntity();
			const callOrder: string[] = [];

			const ctx = createTestContext();
			const inserted = await ctx.store.insert<{ id: string }>('widgets', 'test-org', {
				name: 'Hooked',
				color: 'green'
			});

			const handlers = entityHandlers(entity, {
				async beforeDelete(_ctx, id) {
					// Record should still exist at this point
					const row = await _ctx.store.findOne('widgets', 'test-org', { id });
					callOrder.push(row ? 'beforeDelete:exists' : 'beforeDelete:gone');
				}
			});

			await handleUseCaseRequest(handlers._configs.DELETE!, ctx, { id: inserted.id });

			expect(callOrder).toEqual(['beforeDelete:exists']);
			// Record should be gone after
			const rows = await ctx.store.findMany('widgets', 'test-org');
			expect(rows).toHaveLength(0);
		});

		it('fires afterDelete hook after deletion', async () => {
			const entity = createTestEntity();
			const callOrder: string[] = [];

			const ctx = createTestContext();
			const inserted = await ctx.store.insert<{ id: string }>('widgets', 'test-org', {
				name: 'Hooked',
				color: 'green'
			});

			const handlers = entityHandlers(entity, {
				async afterDelete(_ctx, id) {
					// Record should be gone at this point
					const row = await _ctx.store.findOne('widgets', 'test-org', { id });
					callOrder.push(row ? 'afterDelete:exists' : 'afterDelete:gone');
				}
			});

			await handleUseCaseRequest(handlers._configs.DELETE!, ctx, { id: inserted.id });

			expect(callOrder).toEqual(['afterDelete:gone']);
		});
	});

	describe('permission enforcement', () => {
		it('rejects when auth lacks edit permission', async () => {
			const entity = createTestEntity();
			const handlers = entityHandlers(entity);
			const ctx = createTestContext({
				auth: {
					requireEdit() {
						throw { status: 403, body: { message: 'Forbidden' } };
					}
				}
			});

			await expect(handleUseCaseRequest(handlers._configs.POST!, ctx, { name: 'Denied' })).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('read-only guard', () => {
		it('rejects mutations when org is read-only', async () => {
			const entity = createTestEntity();
			const handlers = entityHandlers(entity);
			const ctx = createTestContext({ readOnly: true });

			await expect(handleUseCaseRequest(handlers._configs.POST!, ctx, { name: 'Blocked' })).rejects.toMatchObject({
				status: 403
			});
		});
	});

	describe('audit config', () => {
		it('uses complex audit resourceType when audit is an object', async () => {
			const entity = defineEntity({
				table: 'gadgets',
				groupScope: 'none',
				schema: {
					id: field(z.string(), { readOnly: true }),
					name: field(z.string())
				},
				permission: 'training',
				audit: { resourceType: 'gadget', action: 'custom' }
			});
			const handlers = entityHandlers(entity);
			const ctx = createTestContext();

			await handleUseCaseRequest(handlers._configs.POST!, ctx, { name: 'Gizmo' });

			expect(ctx.auditPort.events[0].resourceType).toBe('gadget');
		});
	});
});
