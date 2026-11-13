import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from './ratingSchemePersistence.test-support.server';
import type { Evaluation, RatingScheme } from '../contracts';
import { loadRatingSchemeEntryEditor, loadRatingSchemeWorkspace } from './ratingSchemeWorkspaceQuery.server';

const actor = {
	role: 'member' as const,
	isPrivileged: false,
	capabilityMap: {
		calendar: 'none',
		personnel: 'none',
		training: 'none',
		criticalTasks: 'none',
		onboarding: 'none',
		ratingScheme: 'view'
	} as const,
	scopeSet: groupCoverageForTest({ kind: 'groups' as const, groupIds: ['alpha'] })
};
const person = { id: 'person-alpha', rank: 'SGT', firstName: 'Synthetic', lastName: 'Able' };
const chain = {
	raterPersonId: null,
	raterName: 'External rater',
	seniorRaterPersonId: null,
	seniorRaterName: 'External senior',
	intermediateRaterPersonId: null,
	intermediateRaterName: null,
	reviewerPersonId: null,
	reviewerName: null
};
function scheme(id: string, ratedPersonId = person.id): RatingScheme {
	return { id, ratedPersonId, evalType: 'NCOER', ...chain, notes: null, archivedAt: null };
}
function evaluation(id: string, ratingSchemeId: string, ratedPersonId = person.id): Evaluation {
	return {
		id,
		ratingSchemeId,
		ratedPersonId,
		evalType: 'NCOER',
		reportType: 'AN',
		ratingPeriodStart: '2026-01-01',
		ratingPeriodEnd: '2026-12-31',
		workflowStatus: 'with-rater',
		notes: 'Saved note',
		signedChain: null
	};
}

function context(ratingSchemes: RatingScheme[] = [], evaluations: Evaluation[] = []) {
	const ctx = createTestContext({ auth: actor });
	return {
		...ctx,
		ratingScheme: {
			listRatingSchemes: vi.fn().mockResolvedValue(ratingSchemes),
			listEvaluations: vi.fn().mockResolvedValue(evaluations)
		},
		personnelRatingSchemeRoster: {
			listActiveReferences: vi.fn().mockResolvedValue([person]),
			listArchivedRatedPersonIds: vi.fn().mockResolvedValue([])
		}
	};
}

describe('Rating-owned Evals workspace', () => {
	it('loads the schemes, their Evaluations and the Rating-only references', async () => {
		const ctx = context([scheme('scheme-a')], [evaluation('evaluation-a', 'scheme-a')]);
		expect(await loadRatingSchemeWorkspace(ctx)).toEqual({
			personnelLookup: [person],
			ratingSchemes: [scheme('scheme-a')],
			evaluations: [evaluation('evaluation-a', 'scheme-a')]
		});
	});

	it('omits schemes and Evaluations whose rated Person is archived, matching IDs case-insensitively', async () => {
		const ctx = context(
			[scheme('scheme-active'), scheme('scheme-archived', 'person-archived'), scheme('scheme-upper', 'PERSON-UPPER')],
			[
				evaluation('evaluation-active', 'scheme-active'),
				evaluation('evaluation-archived', 'scheme-archived', 'person-archived'),
				evaluation('evaluation-upper', 'scheme-upper', 'PERSON-UPPER')
			]
		);
		ctx.personnelRatingSchemeRoster.listArchivedRatedPersonIds.mockResolvedValue(['PERSON-ARCHIVED', 'person-upper']);
		const result = await loadRatingSchemeWorkspace(ctx);
		expect(result.ratingSchemes.map(({ id }) => id)).toEqual(['scheme-active']);
		expect(result.evaluations.map(({ id }) => id)).toEqual(['evaluation-active']);
		expect(ctx.personnelRatingSchemeRoster.listArchivedRatedPersonIds).toHaveBeenCalledWith(ctx.auth);
	});

	it('rejects a failed source rather than publishing a partial workspace', async () => {
		const archivedFails = context();
		archivedFails.personnelRatingSchemeRoster.listArchivedRatedPersonIds.mockRejectedValue(
			new Error('Archived unavailable')
		);
		await expect(loadRatingSchemeWorkspace(archivedFails)).rejects.toThrow('Archived unavailable');
		const evaluationsFail = context();
		evaluationsFail.ratingScheme.listEvaluations.mockRejectedValue(new Error('Evaluations unavailable'));
		await expect(loadRatingSchemeWorkspace(evaluationsFail)).rejects.toThrow('Evaluations unavailable');
	});

	it('denies Personnel-only readers before any private read', async () => {
		const ctx = context();
		const auth = {
			...ctx.auth,
			capabilityMap: { ...ctx.auth.capabilityMap, personnel: 'view' as const, ratingScheme: 'none' as const }
		};
		await expect(loadRatingSchemeWorkspace({ ...ctx, auth })).rejects.toMatchObject({ status: 403 });
		expect(ctx.ratingScheme.listRatingSchemes).not.toHaveBeenCalled();
		expect(ctx.ratingScheme.listEvaluations).not.toHaveBeenCalled();
		expect(ctx.personnelRatingSchemeRoster.listActiveReferences).not.toHaveBeenCalled();
	});

	it('starts every read before any of them answers', async () => {
		const ctx = context();
		const started = new Set<string>();
		let release!: () => void;
		const wait = new Promise<void>((resolve) => {
			release = resolve;
		});
		const track =
			<T>(name: string, value: T) =>
			async () => {
				started.add(name);
				await wait;
				return value;
			};
		const pending = loadRatingSchemeWorkspace({
			...ctx,
			ratingScheme: {
				listRatingSchemes: track('schemes', [scheme('scheme-a')]),
				listEvaluations: track('evaluations', [evaluation('evaluation-a', 'scheme-a')])
			},
			personnelRatingSchemeRoster: {
				listActiveReferences: track('references', [person]),
				listArchivedRatedPersonIds: track('archived', [])
			}
		});
		try {
			await vi.waitFor(() => expect(started).toEqual(new Set(['schemes', 'evaluations', 'references', 'archived'])));
		} finally {
			release();
		}
		await expect(pending).resolves.toMatchObject({ evaluations: [{ id: 'evaluation-a' }] });
	});

	it('opens one Evaluation with its scheme, and nothing for a missing or archived-Person one', async () => {
		const ctx = context(
			[scheme('scheme-a'), scheme('scheme-gone', 'person-gone')],
			[evaluation('evaluation-a', 'scheme-a'), evaluation('evaluation-gone', 'scheme-gone', 'person-gone')]
		);
		ctx.personnelRatingSchemeRoster.listArchivedRatedPersonIds.mockResolvedValue(['person-gone']);
		expect(await loadRatingSchemeEntryEditor(ctx, 'evaluation-a')).toEqual({
			ratingScheme: scheme('scheme-a'),
			evaluation: evaluation('evaluation-a', 'scheme-a'),
			personnelLookup: [person]
		});
		expect(await loadRatingSchemeEntryEditor(ctx, 'evaluation-gone')).toBeNull();
		expect(await loadRatingSchemeEntryEditor(ctx, 'missing')).toBeNull();
	});
});
