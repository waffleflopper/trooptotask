import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformActivationHealth,
	type PlatformActivationHealth,
	type PlatformActivationHealthStore,
	type PlatformActivationOrganizationFacts,
	type PlatformActivationSetupCounts
} from '$lib/server/core/useCases/platformActivationHealth';

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
};

interface ActivationOrganizationRow {
	id: string;
	name: string | null;
	created_at: string | null;
}

interface ActivationCountRow {
	id: string;
	organization_id: string;
}

type RpcCountRow<T extends string> = {
	organization_id: string;
} & Record<T, number | string | null>;

const ACTIVATION_ORGANIZATION_COLUMNS = 'id, name, created_at';
const COUNT_PAGE_SIZE = 1000;
const EMPTY_COUNTS: PlatformActivationSetupCounts = {
	activePersonnel: 0,
	members: 0,
	leaderMembers: 0,
	statusTypes: 0,
	assignmentTypes: 0,
	onboardingTemplateSteps: 0,
	trainingTypes: 0,
	ratingSchemeEntries: 0
};

function throwIfSupabaseError(error: unknown): void {
	if (error) throw error;
}

function countByOrganization(rows: ActivationCountRow[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
	}
	return counts;
}

function readRpcCount(value: number | string | null): number {
	const count = typeof value === 'number' ? value : Number(value ?? 0);
	return Number.isFinite(count) && count > 0 ? count : 0;
}

function countRpcRowsByOrganizationId<T extends string>(
	rows: Array<RpcCountRow<T>>,
	countField: T
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		counts.set(row.organization_id, readRpcCount(row[countField]));
	}
	return counts;
}

async function countRowsByExistingRpc<T extends string>(
	supabase: SupabaseClient,
	functionName: string,
	countField: T,
	organizationIds: string[]
): Promise<Map<string, number>> {
	const response = (await supabase.rpc(functionName, {
		p_org_ids: organizationIds
	})) as SupabaseResponse<Array<RpcCountRow<T>>>;
	throwIfSupabaseError(response.error);
	return countRpcRowsByOrganizationId(response.data ?? [], countField);
}

async function countRowsByOrganization(
	supabase: SupabaseClient,
	table: string,
	organizationIds: string[],
	options: { roles?: Array<'owner' | 'admin' | 'member'> } = {}
): Promise<Map<string, number>> {
	const rows: ActivationCountRow[] = [];
	let from = 0;

	while (true) {
		let builder = supabase
			.from(table)
			.select('id, organization_id')
			.in('organization_id', organizationIds)
			.order('organization_id', { ascending: true })
			.order('id', { ascending: true })
			.range(from, from + COUNT_PAGE_SIZE - 1);
		if (options.roles) builder = builder.in('role', options.roles);
		const response = (await builder) as SupabaseResponse<ActivationCountRow[]>;
		throwIfSupabaseError(response.error);

		const page = response.data ?? [];
		rows.push(...page);
		if (page.length < COUNT_PAGE_SIZE) break;
		from += COUNT_PAGE_SIZE;
	}

	return countByOrganization(rows);
}

function applyCounts(
	factsByOrgId: Map<string, PlatformActivationOrganizationFacts>,
	counts: Map<string, number>,
	field: keyof PlatformActivationSetupCounts
): void {
	for (const [organizationId, count] of counts.entries()) {
		const facts = factsByOrgId.get(organizationId);
		if (facts) facts.counts[field] = count;
	}
}

export function createSupabasePlatformActivationHealthStore(supabase: SupabaseClient): PlatformActivationHealthStore {
	return {
		async listActivationOrganizationFacts(input): Promise<PlatformActivationOrganizationFacts[]> {
			const response = (await supabase
				.from('organizations')
				.select(ACTIVATION_ORGANIZATION_COLUMNS)
				.order('created_at', { ascending: false })
				.order('id', { ascending: false })
				.limit(input.limit)) as SupabaseResponse<ActivationOrganizationRow[]>;
			throwIfSupabaseError(response.error);
			const factsByOrgId = new Map<string, PlatformActivationOrganizationFacts>();
			for (const row of response.data ?? []) {
				factsByOrgId.set(row.id, {
					organizationId: row.id,
					organizationName: row.name,
					organizationCreatedAt: row.created_at,
					counts: { ...EMPTY_COUNTS }
				});
			}
			const organizationIds = [...factsByOrgId.keys()];
			if (organizationIds.length === 0) return [];

			const [
				activePersonnelCounts,
				memberCounts,
				leaderMemberCounts,
				statusTypeCounts,
				assignmentTypeCounts,
				onboardingTemplateStepCounts,
				trainingTypeCounts,
				ratingSchemeEntryCounts
			] = await Promise.all([
				countRowsByExistingRpc(supabase, 'count_personnel_by_organization', 'personnel_count', organizationIds),
				countRowsByExistingRpc(supabase, 'count_memberships_by_organization', 'membership_count', organizationIds),
				countRowsByOrganization(supabase, 'organization_memberships', organizationIds, { roles: ['owner', 'admin'] }),
				countRowsByOrganization(supabase, 'status_types', organizationIds),
				countRowsByOrganization(supabase, 'assignment_types', organizationIds),
				countRowsByOrganization(supabase, 'onboarding_template_steps', organizationIds),
				countRowsByOrganization(supabase, 'training_types', organizationIds),
				countRowsByOrganization(supabase, 'rating_scheme_entries', organizationIds)
			]);

			applyCounts(factsByOrgId, activePersonnelCounts, 'activePersonnel');
			applyCounts(factsByOrgId, memberCounts, 'members');
			applyCounts(factsByOrgId, leaderMemberCounts, 'leaderMembers');
			applyCounts(factsByOrgId, statusTypeCounts, 'statusTypes');
			applyCounts(factsByOrgId, assignmentTypeCounts, 'assignmentTypes');
			applyCounts(factsByOrgId, onboardingTemplateStepCounts, 'onboardingTemplateSteps');
			applyCounts(factsByOrgId, trainingTypeCounts, 'trainingTypes');
			applyCounts(factsByOrgId, ratingSchemeEntryCounts, 'ratingSchemeEntries');

			return organizationIds.map((organizationId) => factsByOrgId.get(organizationId)!);
		}
	};
}

export function createSupabasePlatformActivationHealth(ctx: AdminContext): PlatformActivationHealth {
	return createPlatformActivationHealth({
		store: createSupabasePlatformActivationHealthStore(ctx.adminClient)
	});
}
