import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { OnboardingSupportReader } from '../supportReadTypes';

/** Onboarding selects and maps its own saved configuration, after delivery admission. */
export function createOnboardingSupportReader(client: SupabaseClient): OnboardingSupportReader {
	return {
		async countTemplateStepsByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return new Map();
			type Row = { id: string; organization_id: string };
			const requested = new Map(ids.map((value) => [value.toLowerCase(), value]));
			const { data, error } = await selectAllSupabaseRows<Row>(async (from, to) => {
				const result = await client
					.from('onboarding_template_steps')
					.select('id, organization_id')
					.in('organization_id', ids)
					.order('organization_id', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to);
				if (result.error) throw result.error;
				if (!Array.isArray(result.data)) throw new Error('Onboarding setup facts were unavailable');
				const data = result.data.map((value) => {
					if (
						!value ||
						typeof value !== 'object' ||
						Array.isArray(value) ||
						typeof value.id !== 'string' ||
						!value.id ||
						typeof value.organization_id !== 'string'
					)
						throw new Error('Onboarding setup facts were unavailable');
					const organizationId = requested.get(value.organization_id.toLowerCase());
					if (!organizationId) throw new Error('Onboarding setup facts were unavailable');
					return { id: value.id, organization_id: organizationId };
				});
				return { ...result, data };
			});
			if (error) throw error;
			const counts = new Map<string, number>();
			if (!data) throw new Error('Onboarding setup facts were unavailable');
			for (const row of data) counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
			return counts;
		}
	};
}
