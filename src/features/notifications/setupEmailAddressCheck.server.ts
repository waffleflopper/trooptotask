import type { SupabaseClient } from '$lib/server/database';

export function createSetupEmailAddressCheckNotifier(client: SupabaseClient) {
	return async (input: {
		recipients: Array<{ organizationId: string; userId: string }>;
		name: string;
		email: string;
		reason: 'bounced' | 'expiredUnused';
	}) => {
		if (!input.recipients.length) return;
		const { error } = await client.from('notifications').insert(
			input.recipients.map((recipient) => ({
				organization_id: recipient.organizationId,
				user_id: recipient.userId,
				type: 'setup_email_address_check',
				title: 'Check an invitation address',
				message: `The setup email for ${input.name} (${input.email}) ${input.reason === 'bounced' ? 'bounced' : 'expired unused'}. Check the address with the person you invited.`,
				link: `/org/${recipient.organizationId}/settings/members`
			}))
		);
		if (error) throw new Error('Unable to notify the inviter');
	};
}
