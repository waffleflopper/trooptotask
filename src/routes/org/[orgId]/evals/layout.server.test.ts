import { beforeEach, describe, expect, it, vi } from 'vitest';
import { error, type Cookies } from '@sveltejs/kit';

const { loadWithContext, loadWorkspace } = vi.hoisted(() => ({ loadWithContext: vi.fn(), loadWorkspace: vi.fn() }));
vi.mock('$lib/server/adapters/httpAdapter', () => ({ loadWithContext }));
vi.mock('$features/rating-scheme/index.server', () => ({ loadRatingSchemeWorkspace: loadWorkspace }));
import { _streamRatingSchemeWorkspace } from './+layout.server';

function httpFailure(status: number, message: string) {
	try {
		error(status, message);
	} catch (cause) {
		return cause;
	}
}

const context = { locals: {} as App.Locals, cookies: {} as Cookies, orgId: 'requested-org' };
const entry = {
	id: 'entry-1',
	ratedPersonId: 'person-1',
	evalType: 'OER',
	raterPersonId: null,
	raterName: 'External rater',
	seniorRaterPersonId: null,
	seniorRaterName: 'External senior',
	intermediateRaterPersonId: null,
	intermediateRaterName: null,
	reviewerPersonId: null,
	reviewerName: null,
	ratingPeriodStart: '2026-01-01',
	ratingPeriodEnd: '2026-12-31',
	status: 'active',
	notes: 'Retained notes',
	reportType: 'AN',
	workflowStatus: null
};

describe('Evals workspace delivery', () => {
	beforeEach(() => vi.clearAllMocks());
	it('streams authorized entries and hydrates the admitted Organization', async () => {
		loadWorkspace.mockResolvedValue({ personnelLookup: [], ratingSchemeEntries: [entry], lossWarningWindowDays: 120 });
		loadWithContext.mockImplementation((_locals, _cookies, _orgId, config) => ({
			data: config.fn({ auth: { orgId: 'admitted-org' } })
		}));
		const route = await _streamRatingSchemeWorkspace(context);
		await expect(route.ratingScheme.data).resolves.toMatchObject({
			laneKey: 'ratingScheme',
			data: { ratingSchemeEntries: [entry], lossWarningWindowDays: 120 },
			hydration: { orgId: 'admitted-org', ratingSchemeEntries: { mode: 'replace', deferred: false, items: [entry] } }
		});
	});
	it('settles explicit access denial without loading private workspace facts', async () => {
		loadWithContext.mockReturnValue({ data: Promise.reject(httpFailure(403, 'Denied')) });
		const route = await _streamRatingSchemeWorkspace(context);
		await expect(route.ratingScheme.data).resolves.toEqual({ laneKey: 'ratingScheme', access: 'restricted' });
		expect(loadWorkspace).not.toHaveBeenCalled();
	});
	it.each([new Error('Provider unavailable'), httpFailure(500, 'Unexpected failure')])(
		'propagates unexpected workspace failure',
		async (cause) => {
			loadWithContext.mockReturnValue({ data: Promise.reject(cause) });
			const route = await _streamRatingSchemeWorkspace(context);
			await expect(route.ratingScheme.data).rejects.toBe(cause);
		}
	);
});
