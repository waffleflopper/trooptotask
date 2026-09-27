import type { SupabaseClient } from '@supabase/supabase-js';
import type { SpecialDay } from '$lib/types';
import { getDefaultFederalHolidays } from './utils/federalHolidays';

/** Seed Calendar holidays with the admitted Organization provisioning request client. */
export async function seedFederalHolidays(
	supabase: SupabaseClient,
	organizationId: string,
	specialDays: Array<Pick<SpecialDay, 'date' | 'name' | 'type'>> = getDefaultFederalHolidays()
): Promise<string | null> {
	let firstErrorMessage: string | null = null;
	for (let index = 0; index < specialDays.length; index += 50) {
		const batch = specialDays.slice(index, index + 50).map((specialDay) => ({
			organization_id: organizationId,
			date: specialDay.date,
			name: specialDay.name,
			type: specialDay.type
		}));
		const { error } = await supabase.from('special_days').insert(batch);
		if (error && !firstErrorMessage) firstErrorMessage = error.message;
	}
	return firstErrorMessage;
}
