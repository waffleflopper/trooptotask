<script lang="ts">
	import AccountView from './AccountView.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.person.email ?? 'Person'} - Platform Admin</title>
</svelte:head>

{#key data.person.id}
	<AccountView {data} />
{/key}
