<script lang="ts">
	import type { SummaryResponsibility } from '../eventWorkModel';
	import type { GroupLabels, TaskingResponsibility } from '../taskingModel';

	interface Props {
		responsibility: TaskingResponsibility | SummaryResponsibility;
		groups?: GroupLabels;
		size?: 'default' | 'sm';
	}

	let { responsibility, groups = {}, size = 'default' }: Props = $props();

	const organization = $derived(responsibility.kind === 'organization');
	const label = $derived(
		responsibility.kind === 'organization'
			? 'Organization'
			: 'name' in responsibility
				? responsibility.name
				: (groups[responsibility.groupId] ?? 'Another group')
	);
</script>

<!-- The Organization is outlined in ink so Organization-level work never reads as one more Group. -->
<span
	class={[
		'inline-flex max-w-full shrink-0 items-center rounded-full border font-mono text-[10px] leading-3 font-semibold tracking-[0.08em] uppercase',
		size === 'sm' ? 'h-[18px] px-[7px]' : 'h-[22px] px-[9px]',
		organization ? 'border-foreground text-foreground' : 'border-border bg-muted text-foreground'
	]}
>
	<span class="truncate">{label}</span>
</span>
