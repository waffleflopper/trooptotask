import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { RankCategory, RankPayGrade, RankService, RankState } from '$features/personnel/contracts';
import { buildRouteContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseRankCatalogAdministrationPort } from '$features/personnel/index.server';
import { fail } from '$lib/server/core/errors';
import {
	addOrganizationRankServicePack,
	bulkSetOrganizationRankCatalogState,
	reactivateOrganizationRankCatalogEntry,
	removeOrganizationRankCatalogEntry,
	retireOrganizationRankCatalogEntry,
	saveOrganizationRankCatalogEntry
} from '$features/personnel/index.server';
import { toActionFailure } from '../settingsActionFailure.server';
import { loadSettingsPage } from '../settingsLoad.server';
import { loadRanksSettings } from '../settingsRanks.server';

const PG_INTEGER_MIN = -2_147_483_648;
const PG_INTEGER_MAX = 2_147_483_647;

export const load: PageServerLoad = (event) =>
	loadSettingsPage(event, async (ctx) => ({
		ranksSettings: await loadRanksSettings(ctx)
	}));

export const actions: Actions = {
	addServicePack: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
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

	bulkRankState: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			const service = getStringFormValue(formData, 'service') as RankService;
			const targetState = getStringFormValue(formData, 'targetState') as RankState;
			if (targetState !== 'active' && targetState !== 'retired') {
				fail(400, 'Bulk rank state must be active or retired.');
			}

			const result = await bulkSetOrganizationRankCatalogState(ctx, { service, targetState });

			return {
				success: true,
				service,
				state: targetState,
				changedCount: result.changedCount
			};
		} catch (error) {
			return toActionFailure('rankError', error);
		}
	},

	saveRank: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
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

	retireRank: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const code = getStringFormValue(formData, 'code');
		try {
			await retireOrganizationRankCatalogEntry(await buildRouteContext(event), { code });
			return { success: true, code };
		} catch (error) {
			return toActionFailure('rankError', error);
		}
	},

	reactivateRank: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		const code = getStringFormValue(formData, 'code');
		try {
			await reactivateOrganizationRankCatalogEntry(await buildRouteContext(event), { code });
			return { success: true, code };
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
			const ctx = await buildRouteContext(event);
			await removeOrganizationRankCatalogEntry(
				{
					...ctx,
					rankCatalogAdministration: createSupabaseRankCatalogAdministrationPort(locals)
				},
				{ code }
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
		fail(400, 'Tie-break order must be a whole number.');
	}

	const sortOrder = Number(rawSortOrder);
	if (!Number.isSafeInteger(sortOrder) || sortOrder < PG_INTEGER_MIN || sortOrder > PG_INTEGER_MAX) {
		fail(400, 'Tie-break order must fit within PostgreSQL integer range.');
	}

	return sortOrder;
}
