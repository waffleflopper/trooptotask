<script lang="ts">
	import { Button, type ButtonProps } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

	interface Props extends Pick<ButtonProps, 'onclick' | 'children'> {
		/** Mutes and strikes the text, for a row that is finished. */
		struck?: boolean;
		ref?: HTMLElement | null;
	}

	let { struck = false, ref = $bindable(null), onclick, children }: Props = $props();
</script>

<Button
	bind:ref
	type="button"
	variant="ghost"
	size="none"
	class={cn(
		'h-auto min-w-0 justify-start px-0 text-left text-[15px] font-normal whitespace-pre-wrap wrap-anywhere hover:bg-transparent hover:underline dark:hover:bg-transparent',
		struck && 'text-muted-foreground line-through'
	)}
	{onclick}
>
	{@render children?.()}
</Button>
