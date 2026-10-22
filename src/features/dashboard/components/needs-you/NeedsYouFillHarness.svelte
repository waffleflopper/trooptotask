<script lang="ts">
	import type { DashboardPageUpdates } from '../../dashboardPageUpdates';
	import type { DashboardScreenModel } from '../../read-model/dashboardScreenModel.svelte';
	import { buildNeedsYouQueue } from '../../sections/needsYou';
	import { unfilledDuty } from '../../sections/needsYouSources';
	import NeedsYouQueue from '../NeedsYouQueue.svelte';

	let { model, updates }: { model: DashboardScreenModel; updates: DashboardPageUpdates } = $props();

	const queue = $derived(buildNeedsYouQueue([unfilledDuty(model.inputs)]));
</script>

<NeedsYouQueue {queue} {model} access={{ can: () => true, isPrivileged: false }} {updates} />
