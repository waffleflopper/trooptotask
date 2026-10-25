<script lang="ts">
	import { invalidate } from '$app/navigation';
	import ProfilePage from '$features/identity/ProfilePage.svelte';
	import { LeaveOrganizationDialog } from '$features/organization';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let leaving = $state(false);
</script>

{#if data.shell.kind === 'ready'}
	{@const shell = data.shell}
	<ProfilePage
		account={shell.user}
		ranks={data.ranks}
		{form}
		securityHref={`/org/${shell.org.urlSegment}/account/security`}
		unit={{ name: shell.org.name, role: shell.member.role }}
		onretry={() => invalidate('app:org-core')}
		onleave={shell.member.isOwner ? undefined : () => (leaving = true)}
	/>
	{#if !shell.member.isOwner}
		<LeaveOrganizationDialog
			bind:open={leaving}
			orgName={shell.org.name}
			orgUrlSegment={shell.org.urlSegment}
			membershipId={shell.member.membershipId}
		/>
	{/if}
{/if}
