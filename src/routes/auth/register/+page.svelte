<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Account Setup - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Account Setup"
	title="Use your Account Setup Link."
	description="Invite-code registration is retired for beta access. Approved users set up their User Account from the link sent by TroopToTask."
	panelEyebrow="Beta setup"
	panelTitle="Choose the right setup path"
	panelDescription="Use the newest setup email, request a fresh setup link, or request beta access if you have not been approved yet."
	imageSrc="/auth/auth-create-account-invite.png"
	imageAlt="A military account setup packet with an envelope, map, notebook, and blank dog tag."
	supportLabel="What changed"
	supportTitle="Beta setup is link based."
	supportDescription="Account Setup Links activate only your User Account. Organization membership is handled separately after sign-in."
	supportPoints={[
		'Use the newest setup email if you received more than one link.',
		'Fresh setup links are available for approved requests that are still eligible.',
		'Organization invitations remain a separate workflow inside TroopToTask.'
	]}
>
	<div class="flex flex-col gap-5">
		{#if form?.error}
			<AuthNotice tone="error" message={form.error} />
		{/if}

		<AuthNotice tone={data.hadInviteCode ? 'warning' : 'info'} title="Invite codes are no longer used" centered>
			<p>
				{#if data.hadInviteCode}
					The invite code in this URL is from the retired beta registration path.
				{:else}
					This route no longer creates beta accounts from invite codes.
				{/if}
			</p>
			<p>Use an Account Setup Link from your approval email, or request a fresh setup link if it expired.</p>
		</AuthNotice>

		<div class="grid gap-3">
			<Button
				href={resolve(data.email ? `/auth/renew-invite?email=${encodeURIComponent(data.email)}` : '/auth/renew-invite')}
			>
				Request Fresh Setup Link
			</Button>
			<Button href={resolve('/auth/request-access')} variant="outline">Request Beta Access</Button>
			<Button href={resolve('/auth/login')} variant="outline">Sign In</Button>
		</div>
	</div>
</AuthShell>
