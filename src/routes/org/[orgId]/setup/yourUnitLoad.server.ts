import type { Cookies } from '@sveltejs/kit';
import type { SetupStepKey } from '$features/organization/contracts';
import { requireActiveOrganization } from '$features/organization/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { viewerToday } from '$lib/server/viewerDay.server';
import { streamCalendarWorkspaceBootstrap } from '../calendar/calendarWorkspaceDelivery.server';
import { loadCalendarSettingsRankCatalog } from '../calendar/settings/calendarSettingsLoad.server';
import { streamPersonnelWorkspace } from '../personnel/personnelWorkspaceStream.server';
import { loadRanksSettings } from '../settings/settingsRanks.server';
import { createSettingsRanksContext } from '../settings/settingsRequestContexts.server';

interface YourUnitStepEvent {
	locals: App.Locals;
	cookies: Cookies;
	params: { orgId: string };
	depends: (...deps: string[]) => void;
}

/**
 * The editor data a Your unit step embeds, loaded only when that step opens. Each load is the one its Settings or
 * workspace page uses, streamed so the step paints its skeleton first.
 */
export async function loadYourUnitStep(key: SetupStepKey, event: YourUnitStepEvent) {
	switch (key) {
		case 'groups':
		case 'personnel':
			event.depends('app:setup-editor', 'app:personnel-data');
			return { asOf: viewerToday(event.cookies), ...(await streamPersonnelWorkspace(event)) };
		case 'ranks': {
			event.depends('app:setup-editor', 'app:org-core');
			const { data } = await loadWithContext(event.locals, event.cookies, event.params.orgId, {
				context: createSettingsRanksContext,
				policyAction: POLICY_ACTION_CATALOG.organization.accessGovernance,
				policyResource: { kind: 'organization' },
				defer: true,
				fn: loadRanksSettings
			});
			return { ranksSettings: data };
		}
		case 'calendar': {
			event.depends('app:setup-editor', 'app:org-core', 'app:calendar-data');
			const organization = await requireActiveOrganization(event.locals, event.params.orgId);
			const [workspace, rankCatalog] = await Promise.all([
				streamCalendarWorkspaceBootstrap({ locals: event.locals, cookies: event.cookies, orgId: organization.id }),
				loadCalendarSettingsRankCatalog(event)
			]);
			return { ...workspace, rankCatalog };
		}
		default:
			return {};
	}
}
