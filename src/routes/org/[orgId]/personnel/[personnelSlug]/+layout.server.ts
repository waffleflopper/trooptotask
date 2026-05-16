import { error } from '@sveltejs/kit';
import type { LayoutServerLoadEvent } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { UseCaseContext } from '$lib/server/core/ports';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import type { PersonnelDetailHeader } from '$features/personnel/personnel-detail.types';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/server/core/useCases/featurePolicy';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelDetailLayoutLoadDeps {
	loadWithContext?: LoadWithContext;
}

async function resolvePersonnelHeader(ctx: UseCaseContext, personnelSlug: string): Promise<PersonnelDetailHeader> {
	const row = await (ctx.rawStore ?? ctx.store).findOne<Record<string, unknown>>(
		'personnel',
		ctx.auth.orgId,
		{ slug: personnelSlug },
		PersonnelEntity.select
	);
	if (!row) {
		throw error(404, 'Personnel record not found');
	}

	const person = PersonnelEntity.fromDb(row);
	await requireFeaturePolicy(
		ctx,
		POLICY_ACTION_CATALOG.personnel.manageRecords,
		policyResourceForGroup(person.groupId),
		'personnel',
		person.id
	);
	await ctx.auth.requireGroupAccess(person.id);

	return { person };
}

export function _createPersonnelDetailLayoutLoad(deps: PersonnelDetailLayoutLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, depends }: LayoutServerLoadEvent) => {
		depends('app:personnel-detail-header');
		const { orgId, personnelSlug } = params;

		const personnelDetailHeader = await loadWithContextFn(locals, cookies, orgId, {
			permission: 'none',
			fn: (ctx) => resolvePersonnelHeader(ctx, personnelSlug)
		});

		return {
			personnelDetailHeader
		};
	};
}

export const load = _createPersonnelDetailLayoutLoad();
