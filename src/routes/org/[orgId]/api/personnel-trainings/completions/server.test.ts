import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { createTestContext as createMemoryTestContext } from '$lib/server/adapters/inMemory';
import {
	createInMemoryTrainingCatalogPersistence,
	createInMemoryTrainingCertificateStore,
	createInMemoryTrainingCompletionPersistence
} from '$features/training/server/inMemoryTrainingPersistence.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const PERSON = '00000000-0000-4000-8000-00000000400A';
const TRAINING_TYPE = '00000000-0000-4000-8000-000000004002';
const RECORD = '00000000-0000-4000-8000-000000004003';
const CERTIFICATE_PATH =
	/^test-org\/personnel\/00000000-0000-4000-8000-00000000400a\/training-certificates\/[0-9a-f-]{36}\/range_card.pdf$/;

const pdf = () => new File([new TextEncoder().encode('%PDF-1.7\n')], 'range card.pdf', { type: 'application/pdf' });

function withCertificates<T extends ReturnType<typeof createMemoryTestContext>>(ctx: T) {
	ctx.store.seed('personnel', [{ id: PERSON, organization_id: ctx.auth.orgId, group_id: null }]);
	ctx.store.seed('training_types', [
		{ id: TRAINING_TYPE, organization_id: ctx.auth.orgId, expiration_months: 24, expiration_date_only: false }
	]);
	return {
		...ctx,
		trainingCertificates: createInMemoryTrainingCertificateStore(ctx.store, ctx.storage, ctx.auth.orgId)
	};
}

describe('POST /api/personnel-trainings/completions', () => {
	it('stores the certificate under the Person and records the completion with its path', async () => {
		const ctx = withCertificates(createTestContext());

		const { record } = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{ personnelId: PERSON, trainingTypeId: TRAINING_TYPE, completionDate: '2026-04-01', certificate: pdf() },
			() => ctx
		);

		expect(record).toEqual({
			id: expect.any(String),
			personnelId: PERSON,
			trainingTypeId: TRAINING_TYPE,
			completionDate: '2026-04-01',
			expirationDate: '2028-04-01',
			notes: null,
			certificateUrl: expect.stringMatching(CERTIFICATE_PATH),
			organization_id: ctx.auth.orgId
		});
		expect(ctx.storage.files.map((file) => `${file.bucket}/${file.path}`)).toEqual([
			`training-certificates/${record.certificateUrl}`
		]);
	});

	it('records a new completion without a file and clears the certificate on the current record', async () => {
		const ctx = withCertificates(createTestContext());
		ctx.store.seed('personnel_trainings', [
			{
				id: RECORD,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON,
				training_type_id: TRAINING_TYPE,
				completion_date: '2024-04-01',
				expiration_date: '2026-04-01',
				notes: 'Old',
				certificate_url: 'https://example.test/old.pdf'
			}
		]);

		const { record } = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{ personnelId: PERSON, trainingTypeId: TRAINING_TYPE, completionDate: '2026-04-02', notes: 'Renewed' },
			() => ctx
		);

		expect(record).toMatchObject({
			id: RECORD,
			completionDate: '2026-04-02',
			expirationDate: '2028-04-02',
			notes: 'Renewed',
			certificateUrl: null
		});
	});

	it('clears the previous note when a new completion is logged without notes', async () => {
		const ctx = withCertificates(createTestContext());
		ctx.store.seed('personnel_trainings', [
			{
				id: RECORD,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON,
				training_type_id: TRAINING_TYPE,
				completion_date: '2026-10-19',
				expiration_date: '2028-10-19',
				notes: 'First completion note',
				certificate_url: null
			}
		]);

		const { record } = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{ personnelId: PERSON, trainingTypeId: TRAINING_TYPE, completionDate: '2026-10-18' },
			() => ctx
		);

		expect(record).toMatchObject({ id: RECORD, completionDate: '2026-10-18', notes: null });
	});

	it('keeps the certificate when the same completion is logged again without a file', async () => {
		const ctx = withCertificates(createTestContext());
		ctx.store.seed('personnel_trainings', [
			{
				id: RECORD,
				organization_id: ctx.auth.orgId,
				personnel_id: PERSON,
				training_type_id: TRAINING_TYPE,
				completion_date: '2026-04-02',
				expiration_date: '2028-04-02',
				notes: null,
				certificate_url: 'https://example.test/kept.pdf'
			}
		]);

		const { record } = await handleUseCaseRequest(
			_postConfig,
			ctx,
			{ personnelId: PERSON, trainingTypeId: TRAINING_TYPE, completionDate: '2026-04-02', notes: 'Card signed' },
			() => ctx
		);

		expect(record).toMatchObject({
			completionDate: '2026-04-02',
			notes: 'Card signed',
			certificateUrl: 'https://example.test/kept.pdf'
		});
	});

	it('removes the uploaded certificate when the record write fails', async () => {
		const ctx = withCertificates(
			createMemoryTestContext({
				trainingCatalogFactory: createInMemoryTrainingCatalogPersistence,
				trainingCompletionsFactory: (store, orgId) => ({
					...createInMemoryTrainingCompletionPersistence(store, orgId),
					createRecord: async () => {
						throw new Error('Training record write was lost');
					}
				})
			})
		);

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ personnelId: PERSON, trainingTypeId: TRAINING_TYPE, completionDate: '2026-04-01', certificate: pdf() },
				() => ctx
			)
		).rejects.toThrow('Training record write was lost');
		expect(ctx.storage.files).toEqual([]);
	});

	it.each([
		['a certificate that is not a PDF', { certificate: new File(['hello'], 'notes.txt', { type: 'text/plain' }) }],
		['a PDF whose bytes are not a PDF', { certificate: new File(['hello'], 'fake.pdf', { type: 'application/pdf' }) }],
		['an impossible completion date', { completionDate: '2026-02-30' }]
	])('answers 400 for %s and stores nothing', async (_label, fields) => {
		const ctx = withCertificates(createTestContext());

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ personnelId: PERSON, trainingTypeId: TRAINING_TYPE, completionDate: '2026-04-01', ...fields },
				() => ctx
			)
		).rejects.toMatchObject({ status: 400 });
		expect(ctx.storage.files).toEqual([]);
		expect(await ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).toEqual([]);
	});

	it('refuses a Training viewer before storing anything', async () => {
		const ctx = withCertificates(
			createTestContext({
				auth: {
					role: 'member',
					isPrivileged: false,
					capabilityMap: {
						calendar: 'none',
						personnel: 'none',
						training: 'view',
						criticalTasks: 'none',
						onboarding: 'none',
						ratingScheme: 'none'
					}
				}
			})
		);

		await expect(
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{ personnelId: PERSON, trainingTypeId: TRAINING_TYPE, completionDate: '2026-04-01', certificate: pdf() },
				() => ctx
			)
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.storage.files).toEqual([]);
	});
});
