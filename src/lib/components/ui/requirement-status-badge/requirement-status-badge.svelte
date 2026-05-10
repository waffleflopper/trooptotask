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
		style?: string;
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
			class: 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300'
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
			class: 'text-foreground',
			style:
				'background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted-foreground) 22%, transparent) 0 1px, transparent 1px 6px), var(--background);'
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

<Badge variant="outline" class={cn(visual.class, className)} style={visual.style} {...restProps}>
	{label ?? visual.label}
</Badge>
