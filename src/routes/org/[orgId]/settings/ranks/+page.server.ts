import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	RANK_TIE_BREAK_RANGE_MESSAGE,
	RANK_TIE_BREAK_WHOLE_NUMBER_MESSAGE,
	type RankCategory,
	type RankPayGrade,
	type RankService,
	type RankState
} from '$features/personnel/contracts';
import { buildRouteRequest, createRequestRankCatalogContext } from '$lib/server/adapters/requestContexts.server';
import { createSupabaseRankCatalogAdministrationPort } from '$features/personnel/index.server';
import { fail } from '$lib/errors';
import {
	addOrganizationRankServicePack,
	removeOrganizationRankCatalogEntry,
	saveOrganizationRankCatalogEntry,
	setOrganizationRankCatalogStates
} from '$features/personnel/index.server';
import { toActionFailure } from '$lib/server/adapters/httpAdapter';
import { loadSettingsPage } from '../settingsLoad.server';
import { loadRanksSettings } from '../settingsRanks.server';
import { createSettingsRanksContext } from '../settingsRequestContexts.server';

const PG_INTEGER_MIN = -2_147_483_648;
const PG_INTEGER_MAX = 2_147_483_647;

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, createSettingsRanksContext, async (ctx) => ({
		ranksSettings: await loadRanksSettings(ctx)
	}));

export const actions: Actions = {
	addServicePack: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = createRequestRankCatalogContext(await buildRouteRequest(event));
			const result = await addOrganizationRankServicePack(ctx, {
				service: getStringFormValue(formData, 'service') as RankService
			});

			return {
				success: true,
				addedCount: result.addedCount,
				skippedExistingCount: result.skippedExistingCount
			};
		} catch (error) {
			return toActionFailure('rankError', error);
		}
	},

	setRankStates: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const codes = formData.getAll('code');
			const states = formData.getAll('state');
			if (codes.length !== states.length) fail(400, 'Each rank needs a state.');
			const result = await setOrganizationRankCatalogStates(
				createRequestRankCatalogContext(await buildRouteRequest(event)),
				{ changes: codes.map((code, index) => ({ code: String(code), state: String(states[index]) as RankState })) }
			);
			return { success: true, changedCount: result.changedCount };
		} catch (error) {
			return toActionFailure('rankError', error);
		}
	},

	saveRank: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = createRequestRankCatalogContext(await buildRouteRequest(event));
			const code = getStringFormValue(formData, 'code');
			const originalCode = getStringFormValue(formData, 'originalCode');
			const intent = getRankSaveIntent(formData);
			if (intent === 'update' && originalCode !== code) {
				fail(400, 'Rank code cannot be changed from this edit form.');
			}
			const saved = await saveOrganizationRankCatalogEntry(ctx, {
				code,
				label: getStringFormValue(formData, 'label'),
				service: getStringFormValue(formData, 'service') as RankService,
				category: getStringFormValue(formData, 'category') as RankCategory,
				payGrade: getStringFormValue(formData, 'payGrade') as RankPayGrade,
				state: getStringFormValue(formData, 'state') as RankState,
				sortOrder: parseSortOrder(formData),
				intent,
				originalCode
			});

			return { success: true, code: saved.code };
		} catch (error) {
			return toActionFailure('rankError', error);
		}
	},

	deleteRank: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const code = getStringFormValue(formData, 'code');
		try {
			const ctx = createSettingsRanksContext(await buildRouteRequest(event));
			await removeOrganizationRankCatalogEntry(
				{
					...ctx,
					rankCatalogAdministration: createSupabaseRankCatalogAdministrationPort()
				},
				{ code },
				() => ctx.trainingCatalog.listRankApplicabilityReferences(),
				ctx.readSignInRosterRankReferences
			);
			return { success: true, code };
		} catch (error) {
			return toActionFailure('rankError', error);
		}
	}
};

function getStringFormValue(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value : '';
}

function getRankSaveIntent(formData: FormData): 'create' | 'update' {
	return getStringFormValue(formData, 'intent') === 'edit' ? 'update' : 'create';
}

function parseSortOrder(formData: FormData): number {
	const rawSortOrder = getStringFormValue(formData, 'sortOrder').trim();
	if (!/^-?\d+$/.test(rawSortOrder)) {
		fail(400, RANK_TIE_BREAK_WHOLE_NUMBER_MESSAGE);
	}

	const sortOrder = Number(rawSortOrder);
	if (!Number.isSafeInteger(sortOrder) || sortOrder < PG_INTEGER_MIN || sortOrder > PG_INTEGER_MAX) {
		fail(400, RANK_TIE_BREAK_RANGE_MESSAGE);
	}

	return sortOrder;
}
