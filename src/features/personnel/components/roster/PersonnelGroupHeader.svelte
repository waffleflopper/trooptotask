<script lang="ts">
	import PinIcon from '@lucide/svelte/icons/pin';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Toggle } from '$lib/components/ui/toggle';
	import type { GroupHeaderContext } from '$lib/components/ui/data-table';

	interface Props {
		group: GroupHeaderContext;
		pinned: boolean;
		onTogglePin: (groupKey: string) => void;
	}

	let { group, pinned, onTogglePin }: Props = $props();
</script>

<Toggle
	pressed={pinned}
	data-pin-group={group.key}
	onPressedChange={() => onTogglePin(group.key)}
	title={pinned ? 'Unpin group' : 'Pin group to top'}
	aria-label={pinned ? `Unpin ${group.label}` : `Pin ${group.label}`}
>
	<PinIcon aria-hidden="true" />
</Toggle>
<Button
	type="button"
	variant="ghost"
	onclick={group.toggle}
	aria-expanded={!group.collapsed}
	aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.label}`}
>
	{group.label}
	<Badge variant="outline">{group.count}</Badge>
</Button>
