import { createPersonnelLeaderNoteDeliveryContext } from '$lib/server/adapters/requestContexts.server';
import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig, _postConfig } from './+server';
import { _patchConfig } from './[noteId]/+server';

const PERSON_ID = '00000000-0000-4000-8000-0000000000a1';
const OTHER_PERSON_ID = '00000000-0000-4000-8000-0000000000a2';
const NOTE_ID = '00000000-0000-4000-8000-0000000000b1';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{
			id: PERSON_ID,
			organization_id: ctx.auth.orgId,
			group_id: null
		}
	]);
}

describe('/api/personnel/[id]/leader-notes', () => {
	it('lists and creates leader notes through the API configs', async () => {
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
			}
		});
		seedPersonnel(ctx);

		await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				text: 'Won the monthly Soldier board.'
			},
			() => createPersonnelLeaderNoteDeliveryContext(ctx)
		);
		const notes = await handleUseCaseRequest(_getConfig, ctx, { personnelId: PERSON_ID }, () =>
			createPersonnelLeaderNoteDeliveryContext(ctx)
		);

		expect(notes).toHaveLength(1);
		expect(notes[0]).toMatchObject({
			author: 'test-user',
			text: 'Won the monthly Soldier board.'
		});
	});

	it('derives the Personnel id from the route param and rejects mismatched bodies', async () => {
		await expect(
			_postConfig.parseInput?.({
				params: { id: PERSON_ID },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ personnelId: OTHER_PERSON_ID, text: 'Mismatch' })
				})
			} as never)
		).rejects.toMatchObject({ status: 400 });

		await expect(
			_postConfig.parseInput?.({
				params: { id: PERSON_ID },
				request: new Request('http://localhost', {
					method: 'POST',
					body: JSON.stringify({ text: 'Observation' })
				})
			} as never)
		).resolves.toMatchObject({ personnelId: PERSON_ID, text: 'Observation' });
	});

	it('answers 404 for a Person path that is not an id and 400 for a malformed body', async () => {
		await expect(
			_getConfig.parseInput?.({
				params: { id: 'abc' },
				url: new URL('http://localhost'),
				request: new Request('http://localhost')
			} as never)
		).rejects.toMatchObject({ status: 404, message: 'Personnel record not found' });
		await expect(
			_postConfig.parseInput?.({
				params: { id: PERSON_ID },
				request: new Request('http://localhost', { method: 'POST', body: '{bad' })
			} as never)
		).rejects.toMatchObject({ status: 400, message: 'Invalid JSON in request body' });
	});

	it('reads a page of older notes from a cursor and rejects a half cursor or oversized page', async () => {
		const read = (query: string) =>
			_getConfig.parseInput?.({
				params: { id: PERSON_ID },
				url: new URL(`http://localhost/?${query}`),
				request: new Request('http://localhost')
			} as never);

		await expect(read('')).resolves.toEqual({ personnelId: PERSON_ID });
		await expect(read(`limit=20&beforeCreatedAt=2026-05-01T10:00:00Z&beforeId=${NOTE_ID}`)).resolves.toEqual({
			personnelId: PERSON_ID,
			limit: 20,
			before: { createdAt: '2026-05-01T10:00:00Z', id: NOTE_ID }
		});
		await expect(read('limit=20')).resolves.toEqual({ personnelId: PERSON_ID, limit: 20 });
		await expect(read(`limit=20&beforeId=${NOTE_ID}`)).rejects.toMatchObject({ status: 400 });
		await expect(read('limit=500')).rejects.toMatchObject({ status: 400 });
		await expect(read(`limit=20&beforeCreatedAt=yesterday&beforeId=${NOTE_ID}`)).rejects.toMatchObject({ status: 400 });
		await expect(read('limit=20&beforeCreatedAt=2026-05-01T10:00:00Z&beforeId=abc')).rejects.toMatchObject({
			status: 400
		});
	});

	it('edits the text of a note through PATCH', async () => {
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
			}
		});
		seedPersonnel(ctx);
		ctx.store.seed('leader_notes', [
			{
				id: NOTE_ID,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_ID,
				author: 'test-user',
				text: 'Observation',
				created_at: '2026-05-01T10:00:00Z',
				archived_at: null
			}
		]);

		const edited = await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{ personnelId: PERSON_ID, noteId: NOTE_ID, text: 'Observation, with the date' },
			() => createPersonnelLeaderNoteDeliveryContext(ctx)
		);
		expect(edited).toMatchObject({ id: NOTE_ID, text: 'Observation, with the date' });
	});

	it('requires Personnel configure capability for sensitive note reads', async () => {
		const ctx = createTestContext({
			auth: {
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		seedPersonnel(ctx);

		await expect(
			handleUseCaseRequest(_getConfig, ctx, { personnelId: PERSON_ID }, () =>
				createPersonnelLeaderNoteDeliveryContext(ctx)
			)
		).rejects.toMatchObject({
			status: 403
		});
	});

	it('validates leader-note archive and restore actions explicitly', async () => {
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
			}
		});
		seedPersonnel(ctx);
		ctx.store.seed('leader_notes', [
			{
				id: NOTE_ID,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON_ID,
				author: 'test-user',
				text: 'Observation',
				created_at: '2026-05-01T10:00:00Z',
				archived_at: null
			}
		]);

		const archived = (await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				noteId: NOTE_ID,
				action: 'archive'
			},
			() => createPersonnelLeaderNoteDeliveryContext(ctx)
		)) as { archivedAt: string | null };
		expect(archived.archivedAt).toBeTruthy();
		const restored = (await handleUseCaseRequest(
			_patchConfig,
			ctx,
			{
				personnelId: PERSON_ID,
				noteId: NOTE_ID,
				action: 'restore'
			},
			() => createPersonnelLeaderNoteDeliveryContext(ctx)
		)) as { archivedAt: string | null };
		expect(restored.archivedAt).toBeNull();
		await expect(
			handleUseCaseRequest(
				_patchConfig,
				ctx,
				{
					personnelId: PERSON_ID,
					noteId: NOTE_ID,
					action: 'publish'
				},
				() => createPersonnelLeaderNoteDeliveryContext(ctx)
			)
		).rejects.toMatchObject({ status: 400 });
	});
});
