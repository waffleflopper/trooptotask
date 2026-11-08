<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';

	let { userEmail }: { userEmail: string | null } = $props();
</script>

<AuthShell
	eyebrow="No Organization yet"
	headline={['Waiting for', 'your invite.']}
	lede="Your unit's owner or admin adds you by email. Once they do, the invitation shows up here and you can accept it."
	signedIn={{ account: true }}
	panelEyebrow="Invitations"
	panelTitle="Waiting for an invitation"
	panelDescription="You're not in an Organization yet."
>
	<Empty.Root class="border">
		<Empty.Header>
			<Empty.Description>
				Ask an owner or admin of your unit to invite you. They send the invitation to the email you signed in with. It
				shows up here once it's sent.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			{#if userEmail}
				<p class="mb-2 font-mono text-sm break-all text-foreground">{userEmail}</p>
			{/if}
			<Button variant="outline" href={resolve('/org/new')}>Create an Organization</Button>
		</Empty.Content>
	</Empty.Root>
</AuthShell>
