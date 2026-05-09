<script lang="ts" module>
	import type { RequirementStatus } from './requirement-status-badge.svelte';

	export type TrainingRequirementStatus =
		| 'current'
		| 'warning-yellow'
		| 'warning-orange'
		| 'expired'
		| 'not-completed'
		| 'not-required'
		| 'exempt';

	export const trainingRequirementStatusMap: Record<TrainingRequirementStatus, RequirementStatus> = {
		current: 'current',
		'warning-yellow': 'expiring-soon',
		'warning-orange': 'expiring',
		expired: 'expired',
		'not-completed': 'missing',
		'not-required': 'not-required',
		exempt: 'exempt'
	};
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import RequirementStatusBadge from './requirement-status-badge.svelte';
	import type { WithElementRef } from '$lib/utils.js';

	let {
		status,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		status: TrainingRequirementStatus;
	} = $props();

	const requirementStatus = $derived(trainingRequirementStatusMap[status]);
</script>

<RequirementStatusBadge status={requirementStatus} {...restProps} />
