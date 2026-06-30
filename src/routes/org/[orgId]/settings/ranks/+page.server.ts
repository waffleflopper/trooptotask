import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { RankCategory, RankPayGrade, RankService, RankState } from '$lib/domain/rankCatalog';
import { buildRouteContext } from '$lib/server/adapters/httpAdapter';
import { createSupabaseRankCatalogAdministrationPort } from '$lib/server/adapters/supabaseRankCatalogAdministration';
import {
	addOrganizationRankServicePack,
	removeOrganizationRankCatalogEntry,
	retireOrganizationRankCatalogEntry,
	saveOrganizationRankCatalogEntry
} from '$lib/server/core/useCases/rankCatalog';
import { toActionFailure } from '../settingsActionFailure.server';
import { loadSettingsPage } from '../settingsLoad.server';
import { loadRanksSettings } from '../settingsRanks.server';

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

	saveRank: async (event) => {
		const { request, locals } = event;
		if (!locals.user) throw redirect(303, '/auth/login');

		const formData = await request.formData();
		try {
			const ctx = await buildRouteContext(event);
			const saved = await saveOrganizationRankCatalogEntry(ctx, {
				code: getStringFormValue(formData, 'code'),
				label: getStringFormValue(formData, 'label'),
				service: getStringFormValue(formData, 'service') as RankService,
				category: getStringFormValue(formData, 'category') as RankCategory,
				payGrade: getStringFormValue(formData, 'payGrade') as RankPayGrade,
				state: getStringFormValue(formData, 'state') as RankState,
				sortOrder: Number(getStringFormValue(formData, 'sortOrder'))
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
