<script lang="ts">
	import Layout from './+layout.svelte';

	interface Props {
		canAccessOrganizationGovernance?: boolean;
	}

	let { canAccessOrganizationGovernance = true }: Props = $props();

	const layoutData = $derived({ canAccessOrganizationGovernance } as never);
</script>

<Layout data={layoutData}>
	<p>Settings content</p>
</Layout>
