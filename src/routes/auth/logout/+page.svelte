<script lang="ts">
	import AuthButton from '$features/identity/AuthButton.svelte';
	import AuthNotice from '$features/identity/AuthNotice.svelte';
	import AuthShell from '$features/identity/AuthShell.svelte';
	import { resolve } from '$app/paths';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign Out - Troop to Task</title>
</svelte:head>

<AuthShell
	eyebrow="Sign Out"
	headline={['Stand down.', 'Sign out.']}
	lede="Signing out should end your session on every device. This page shows what could not be confirmed."
	panelEyebrow="Session"
	panelTitle={form?.localOnly ? 'Signed out on this browser.' : 'Try signing out again.'}
>
	{#if form?.error}
		<AuthNotice tone="error" message={form.error} />
	{/if}
	{#if form?.localOnly}
		<AuthNotice
			message="There is no active session on this browser. Sign-out on other devices has not been confirmed. Sign in again to retry signing out everywhere."
		/>
		<AuthButton href={resolve('/auth/login')}>Sign in</AuthButton>
	{:else}
		<form method="POST" action={resolve('/auth/logout')}>
			<AuthButton>Try again</AuthButton>
		</form>
	{/if}
</AuthShell>
