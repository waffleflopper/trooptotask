<script lang="ts" module>
	export type RequirementStatus =
		| 'current'
		| 'expiring-soon'
		| 'expiring'
		| 'expired'
		| 'missing'
		| 'not-required'
		| 'exempt';

	type RequirementStatusVisual = {
		label: string;
		class: string;
	};

	export const requirementStatusVisuals: Record<RequirementStatus, RequirementStatusVisual> = {
		current: {
			label: 'Current',
			class: 'border-success/20 bg-success-muted text-success-foreground'
		},
		'expiring-soon': {
			label: 'Expiring Soon',
			class: 'border-warning/20 bg-warning-muted text-warning-foreground'
		},
		expiring: {
			label: 'Expiring',
			class: 'border-expiring/20 bg-expiring/10 text-expiring-foreground'
		},
		expired: {
			label: 'Expired',
			class: 'border-danger/20 bg-danger-muted text-danger-foreground'
		},
		missing: {
			label: 'Missing',
			class: 'bg-muted text-muted-foreground'
		},
		'not-required': {
			label: 'Not Required',
			class: 'status-hatch text-foreground'
		},
		exempt: {
			label: 'Exempt',
			class: 'bg-info-muted text-info-foreground'
		}
	};
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		status,
		label,
		class: className,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		status: RequirementStatus;
		label?: string;
	} = $props();

	const visual = $derived(requirementStatusVisuals[status]);
</script>

<Badge variant="outline" class={cn(visual.class, className)} {...restProps}>
	{label ?? visual.label}
</Badge>
