<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils.js';

	type ValidationIssue = {
		label: string;
		count?: number;
		tone?: 'error' | 'warning' | 'neutral';
	};

	type Props = HTMLAttributes<HTMLDivElement> & {
		title?: string;
		description?: string;
		issues?: ValidationIssue[];
		children?: Snippet;
	};

	let {
		title = 'Validation summary',
		description,
		issues = [],
		children,
		class: className,
		...restProps
	}: Props = $props();
	const hasErrors = $derived(issues.some((issue) => issue.tone === 'error'));
</script>

<Alert.Root variant={hasErrors ? 'destructive' : 'default'} class={cn(className)} {...restProps}>
	<Alert.Title>{title}</Alert.Title>
	{#if description}
		<Alert.Description>{description}</Alert.Description>
	{/if}
	{#if issues.length > 0}
		<ul class="mt-2 flex flex-wrap gap-2">
			{#each issues as issue (`${issue.label}-${issue.count ?? 'none'}`)}
				<li>
					<Badge variant={issue.tone === 'error' ? 'destructive' : 'secondary'}>
						{issue.count ?? ''}
						{issue.label}
					</Badge>
				</li>
			{/each}
		</ul>
	{/if}
	{@render children?.()}
</Alert.Root>
