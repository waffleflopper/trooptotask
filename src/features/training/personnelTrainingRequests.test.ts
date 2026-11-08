import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainingBatchRecord } from './contracts';
import {
	loadPersonTrainingRecords,
	recordTrainingCompletions,
	trainingCertificateLink
} from './personnelTrainingRequests';

const RECORD = '00000000-0000-4000-8000-000000006001';

describe('trainingCertificateLink', () => {
	it('opens an uploaded certificate through the app', () => {
		expect(
			trainingCertificateLink('org-1', 'history', RECORD, `org-1/personnel/p/training-certificates/a/card.pdf`)
		).toEqual({
			kind: 'stored',
			href: `/org/org-1/api/personnel-trainings/certificate?kind=history&id=${RECORD}`
		});
	});

	it('links a legacy certificate on another site directly and names that site', () => {
		expect(trainingCertificateLink('org-1', 'current', RECORD, 'https://records.example.test/cert.pdf')).toEqual({
			kind: 'external',
			href: 'https://records.example.test/cert.pdf',
			host: 'records.example.test'
		});
	});

	it('shows nothing when the completion has no certificate', () => {
		expect(trainingCertificateLink('org-1', 'current', RECORD, null)).toBeNull();
	});
});

describe('recordTrainingCompletions', () => {
	afterEach(() => vi.unstubAllGlobals());

	const records = (count: number): TrainingBatchRecord[] =>
		Array.from({ length: count }, (_, index) => ({
			personnelId: `p-${index}`,
			trainingTypeId: 'cpr',
			completionDate: '2026-11-07',
			status: 'completed'
		}));
	const saved = (personnelId: string) => ({ id: `t-${personnelId}`, personnelId, trainingTypeId: 'cpr' });
	const sentIds = (fetch: ReturnType<typeof vi.fn>) =>
		fetch.mock.calls.map(([, init]) => JSON.parse(init.body).records.map((r: TrainingBatchRecord) => r.personnelId));

	it('records a class larger than one request accepts across requests, indexing failures into the whole class', async () => {
		const fetch = vi.fn(async (_url: string, init: { body: string }) => {
			const sent: TrainingBatchRecord[] = JSON.parse(init.body).records;
			return Response.json({
				inserted: sent.slice(1).map((record) => saved(record.personnelId)),
				updated: [],
				exempted: [],
				errors: [{ index: 0, message: `${sent[0].personnelId} failed` }]
			});
		});
		vi.stubGlobal('fetch', fetch);

		const result = await recordTrainingCompletions('org-1', records(501));

		expect(sentIds(fetch).map((ids: string[]) => [ids.length, ids[0]])).toEqual([
			[500, 'p-0'],
			[1, 'p-500']
		]);
		expect(result.inserted).toHaveLength(499);
		expect(result.errors).toEqual([
			{ index: 0, message: 'p-0 failed' },
			{ index: 500, message: 'p-500 failed' }
		]);
	});

	it('keeps what an earlier request saved when a later one fails, and reports the rest as not recorded', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(Response.json({ inserted: [saved('p-0')], updated: [], exempted: [], errors: [] }))
			.mockResolvedValueOnce(Response.json({ message: 'Service unavailable' }, { status: 503 }));
		vi.stubGlobal('fetch', fetch);

		const result = await recordTrainingCompletions('org-1', records(502));

		expect(result.inserted).toEqual([saved('p-0')]);
		expect(result.errors.map((error) => error.index)).toEqual([500, 501]);
	});

	it('throws when the first request fails, since nothing was saved', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json({ message: 'Denied' }, { status: 403 }))
		);

		await expect(recordTrainingCompletions('org-1', records(2))).rejects.toThrow();
	});
});

describe('loadPersonTrainingRecords', () => {
	afterEach(() => vi.unstubAllGlobals());

	it("never answers a Person's records from the browser cache", async () => {
		const fetch = vi.fn(async () => Response.json([]));
		vi.stubGlobal('fetch', fetch);

		await loadPersonTrainingRecords('org-1', RECORD);

		expect(fetch).toHaveBeenCalledWith(`/org/org-1/api/personnel-trainings?personnelId=${RECORD}`, {
			cache: 'no-store'
		});
	});
});
