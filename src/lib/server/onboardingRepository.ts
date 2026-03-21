/**
 * Onboarding Domain Repository — hand-written for complex join queries.
 * Provides named methods for onboarding templates, template steps, and
 * personnel onboardings with nested step progress.
 * See #216 / #224.
 */
import type {
	OnboardingTemplate,
	OnboardingTemplateStep,
	PersonnelOnboarding
} from '$features/onboarding/onboarding.types';
import { OnboardingTemplateEntity } from '$lib/server/entities/onboardingTemplate';
import { OnboardingTemplateStepEntity } from '$lib/server/entities/onboardingTemplateStep';
import { PersonnelOnboardingEntity } from '$lib/server/entities/personnelOnboarding';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase client type varies based on auth context
type SupabaseClient = any;

type DbRow = Record<string, unknown>;

export interface QueryResult<T> {
	data: T[];
	error: string | null;
}

export async function findTemplates(supabase: SupabaseClient, orgId: string): Promise<QueryResult<OnboardingTemplate>> {
	const { data, error } = await supabase
		.from('onboarding_templates')
		.select('*')
		.eq('organization_id', orgId)
		.order('name');

	if (error) {
		return { data: [], error: error.message };
	}

	return { data: OnboardingTemplateEntity.fromDbArray(data ?? []) as OnboardingTemplate[], error: null };
}

export async function findTemplateSteps(
	supabase: SupabaseClient,
	orgId: string
): Promise<QueryResult<OnboardingTemplateStep>> {
	const { data, error } = await supabase
		.from('onboarding_template_steps')
		.select('*')
		.eq('organization_id', orgId)
		.order('sort_order');

	if (error) {
		return { data: [], error: error.message };
	}

	return { data: OnboardingTemplateStepEntity.fromDbArray(data ?? []) as OnboardingTemplateStep[], error: null };
}

export async function findOnboardings(
	supabase: SupabaseClient,
	orgId: string,
	scopedPersonnelIds?: Set<string> | null
): Promise<QueryResult<PersonnelOnboarding>> {
	const { data, error } = await supabase
		.from('personnel_onboardings')
		.select('*, onboarding_step_progress(*)')
		.eq('organization_id', orgId)
		.order('created_at', { ascending: false });

	if (error) {
		return { data: [], error: error.message };
	}

	let rows: DbRow[] = data ?? [];

	if (scopedPersonnelIds) {
		rows = rows.filter((o) => scopedPersonnelIds.has(o.personnel_id as string));
	}

	return { data: PersonnelOnboardingEntity.fromDbArray(rows) as PersonnelOnboarding[], error: null };
}

export async function countTemplateSteps(supabase: SupabaseClient, orgId: string): Promise<number> {
	const { count, error } = await supabase
		.from('onboarding_template_steps')
		.select('id', { count: 'exact', head: true })
		.eq('organization_id', orgId);

	if (error) {
		console.error('Failed to count template steps:', error.message);
		return 0;
	}

	return count ?? 0;
}
