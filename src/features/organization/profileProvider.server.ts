import type { OrganizationProfilePort } from './profile.server';

interface OrganizationSlugRow {
	id: string;
}

export function createSupabaseOrganizationProfilePort(locals: Pick<App.Locals, 'supabase'>): OrganizationProfilePort {
	const supabase = locals.supabase;

	return {
		async renameOrganization(orgId, name) {
			const { data, error } = await supabase
				.from('organizations')
				.update({ name })
				.eq('id', orgId)
				.select('id, name')
				.maybeSingle();

			if (error) return error.message || 'Organization profile update failed';
			return data?.id === orgId && data.name === name ? null : 'Unable to confirm Organization name update';
		},

		async updateOrganizationUrlSlug(orgId, urlSlug) {
			const { data, error } = await supabase
				.from('organizations')
				.update({ url_slug: urlSlug })
				.eq('id', orgId)
				.select('id, url_slug')
				.maybeSingle();

			if (error) return error.message || 'Organization profile update failed';
			return data?.id === orgId && data.url_slug === urlSlug ? null : 'Unable to confirm Organization URL update';
		},

		async findOrganizationByUrlSlug(urlSlug) {
			const { data, error } = await supabase
				.from('organizations')
				.select('id')
				.eq('url_slug', urlSlug)
				.maybeSingle<OrganizationSlugRow>();

			if (error) {
				throw new Error(error.message);
			}

			return data ? { id: data.id } : null;
		}
	};
}
