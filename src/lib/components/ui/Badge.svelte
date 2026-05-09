<script lang="ts">
	import { Badge as ShadcnBadge } from '$lib/components/ui/badge';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';

	interface Props {
		label: string;
		color?: string;
		textColor?: string;
		bold?: boolean;
		variant?: 'filled' | 'outlined';
	}

	let { label, color, textColor = 'white', bold = false, variant = 'filled' }: Props = $props();
</script>

{#if color && variant === 'filled'}
	<CalendarStatusBadge
		statusType={{ id: label, name: label, color, textColor }}
		class={['font-mono uppercase tracking-widest', bold && 'font-bold']}
	>
		{label}
	</CalendarStatusBadge>
{:else}
	<ShadcnBadge
		variant={variant === 'outlined' ? 'outline' : 'secondary'}
		class={['font-mono uppercase tracking-widest', bold && 'font-bold']}
	>
		{label}
	</ShadcnBadge>
{/if}
