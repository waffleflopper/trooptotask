import type { SupabaseClient } from '@supabase/supabase-js';
import type { CalendarAvailabilityRemovalPort } from './contracts';

export function createSupabaseCalendarAvailabilityRemovalPort(
	supabase: SupabaseClient,
	orgId: string
): CalendarAvailabilityRemovalPort {
	return {
		async findPersonnelIds(ids) {
			const uniqueIds = [...new Set(ids)];
			const lookups = [];
			for (let offset = 0; offset < uniqueIds.length; offset += 100) {
				lookups.push(
					supabase
						.from('availability_entries')
						.select('personnel_id')
						.eq('organization_id', orgId)
						.in('id', uniqueIds.slice(offset, offset + 100))
				);
			}
			const pages = await Promise.all(lookups);
			const personnelIds = new Set<string>();
			for (const { data, error } of pages) {
				if (error) throw new Error(error.message);
				for (const row of data ?? []) personnelIds.add(row.personnel_id);
			}
			return [...personnelIds];
		},
		async deleteIds(ids) {
			const { data, error } = await supabase.rpc('delete_availability_entries', {
				p_organization_id: orgId,
				p_ids: ids
			});
			if (error) {
				if (error.code === '42501')
					throw Object.assign(new Error('You do not have access to that Calendar scope'), { status: 403 });
				if (error.code === '22023')
					throw Object.assign(new Error('Provide between 1 and 500 availability IDs'), { status: 400 });
				throw new Error(error.message);
			}
			if (typeof data !== 'number' || !Number.isInteger(data) || data < 0 || data > ids.length)
				throw new Error('Invalid Calendar removal acknowledgment');
			return data;
		}
	};
}
