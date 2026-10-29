import { sanitizeString } from '$lib/server/validation';
import { fail } from '$lib/errors';

export type OrganizationDefaults = {
	groups: Array<{ name: string; sort_order: number }>;
	status_types: Array<{ name: string; color: string; text_color: string; sort_order: number }>;
	assignment_types: Array<{ name: string; short_name: string; assign_to: string; color: string; sort_order: number }>;
	special_days: Array<{ date: string; name: string; type: string }>;
	rank_catalog: Array<{
		code: string;
		label: string;
		service: string;
		category: string;
		pay_grade: string;
		state: string;
		source: string;
		sort_order: number;
	}>;
};

export interface OrgProvisioningPort {
	createOrganization(input: { name: string; requestId: string }): Promise<{ orgId: string } | { failure: string }>;
}

export const ORGANIZATION_CREATION_UNCONFIRMED_MESSAGE =
	"We couldn't confirm that your Organization was created. Select Create and start setup again to finish. Retrying won't create a duplicate.";

export async function provisionOrganization(
	port: OrgProvisioningPort,
	input: { name: string; requestId: string }
): Promise<{ orgId: string }> {
	const name = sanitizeString(input.name, 100);
	if (!name) {
		fail(400, 'Organization name is required');
	}

	const created = await port.createOrganization({ name, requestId: input.requestId });
	if ('failure' in created) {
		console.error('Organization creation error:', created.failure);
		fail(503, ORGANIZATION_CREATION_UNCONFIRMED_MESSAGE, { publicMessage: true });
	}

	return { orgId: created.orgId };
}
