<script lang="ts">
	import { Badge as ShadcnBadge } from '$lib/components/ui/badge';

	interface Props {
		label: string;
		color?: string;
		textColor?: string;
		bold?: boolean;
		variant?: 'filled' | 'outlined';
	}

	let { label, color, textColor = 'white', bold = false, variant = 'filled' }: Props = $props();
</script>

<ShadcnBadge
	variant={color && variant === 'filled' ? 'status' : variant === 'outlined' ? 'outline' : 'secondary'}
	statusType={color && variant === 'filled' ? { id: label, name: label, color, textColor } : undefined}
	class={['font-mono uppercase tracking-widest', bold && 'font-bold']}
>
	{label}
</ShadcnBadge>
