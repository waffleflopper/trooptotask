<script lang="ts">
	import type { Component } from 'svelte';
	import { SetupFlow, setSetupFlow } from '$features/organization';
	import type { SetupFlowSource } from './setupSource';

	let {
		source,
		navigate,
		step: Step
	}: { source: SetupFlowSource; navigate: (href: string) => Promise<void>; step: Component } = $props();

	setSetupFlow(new SetupFlow(() => source, navigate));
</script>

<Step />
