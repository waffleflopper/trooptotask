<script lang="ts">
	import { resolve } from '$app/paths';
	import AuthNotice from '$lib/components/auth/AuthNotice.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign Out - Troop to Task</title>
</svelte:head>

<AuthShell title="Try signing out again.">
	{#if form?.error}
		<AuthNotice tone="error" message={form.error} />
	{/if}
	<form method="POST" action={resolve('/auth/logout')}>
		<Button type="submit" class="w-full">Try again</Button>
	</form>
</AuthShell>
