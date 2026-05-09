<script lang="ts" module>
	import type { RequirementStatus } from './requirement-status-badge.svelte';

	export type CriticalTaskRequirementStatus = 'current' | 'expiring-soon' | 'expired' | 'not-recorded' | 'not-required';

	export const criticalTaskRequirementStatusMap: Record<CriticalTaskRequirementStatus, RequirementStatus> = {
		current: 'current',
		'expiring-soon': 'expiring-soon',
		expired: 'expired',
		'not-recorded': 'missing',
		'not-required': 'not-required'
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
		status: CriticalTaskRequirementStatus;
	} = $props();

	const requirementStatus = $derived(criticalTaskRequirementStatusMap[status]);
</script>

<RequirementStatusBadge status={requirementStatus} {...restProps} />
