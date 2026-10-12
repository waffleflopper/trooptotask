import type { OrganizationDefaults, OrgProvisioningPort } from './provisioning.server';

export function createSupabaseOrganizationCreationPort(
	locals: Pick<App.Locals, 'supabase'>,
	defaults: OrganizationDefaults
): OrgProvisioningPort {
	return {
		async createOrganization({ name, requestId }) {
			try {
				const { data, error } = await locals.supabase.rpc('create_organization', {
					p_name: name,
					p_request_id: requestId,
					p_defaults: defaults
				});
				if (error) return { failure: error.message };
				if (typeof data !== 'string') return { failure: 'The provider did not return an Organization id' };
				return { orgId: data };
			} catch (error) {
				return { failure: error instanceof Error ? error.message : String(error) };
			}
		}
	};
}
