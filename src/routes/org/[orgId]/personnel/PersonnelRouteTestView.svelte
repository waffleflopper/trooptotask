<script lang="ts">
	import AccountPreferencesProvider from '$features/identity/AccountPreferencesProvider.svelte';
	import { getDefaultUserOrgPreferences } from '$features/identity/contracts';

	let { data, Layout = null, Page, preferences = getDefaultUserOrgPreferences() } = $props();
</script>

<AccountPreferencesProvider userId="user-1" orgId={data.shell.org.id} {preferences}>
	{#if Layout}
		<Layout {data}>
			<Page {data} />
		</Layout>
	{:else}
		<Page {data} />
	{/if}
</AccountPreferencesProvider>
