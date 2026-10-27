<script lang="ts">
	import { SetupFlow, setSetupFlow } from '$features/organization';
	import Page from './+page.svelte';
	import type { PageData } from './$types';

	let {
		source,
		navigate
	}: { source: ConstructorParameters<typeof SetupFlow>[0]; navigate: (href: string) => Promise<void> } = $props();

	// svelte-ignore state_referenced_locally
	setSetupFlow(new SetupFlow(source, navigate));
</script>

<Page data={{ orgName: '' } as PageData} />
