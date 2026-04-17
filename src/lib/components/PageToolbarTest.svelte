<script lang="ts">
	import PageToolbar from './PageToolbar.svelte';

	interface Props {
		title: string;
		titleBadge?: string;
		variant?: 'default' | 'compact';
		sticky?: boolean;
		breadcrumbs?: { label: string; href?: string }[];
		subtitle?: string;
		useLeading?: boolean;
		useBelow?: boolean;
	}

	let {
		title,
		titleBadge,
		variant,
		sticky,
		breadcrumbs,
		subtitle,
		useLeading = false,
		useBelow = false
	}: Props = $props();
</script>

{#if useLeading && useBelow}
	<PageToolbar {title} {titleBadge} {variant} {sticky} {breadcrumbs} {subtitle}>
		{#snippet leading()}
			<div data-testid="custom-leading">Custom Leading</div>
		{/snippet}
		{#snippet below()}
			<div data-testid="custom-below">Filter Bar</div>
		{/snippet}
	</PageToolbar>
{:else if useLeading}
	<PageToolbar {title} {titleBadge} {variant} {sticky} {breadcrumbs} {subtitle}>
		{#snippet leading()}
			<div data-testid="custom-leading">Custom Leading</div>
		{/snippet}
	</PageToolbar>
{:else if useBelow}
	<PageToolbar {title} {titleBadge} {variant} {sticky} {breadcrumbs} {subtitle}>
		{#snippet below()}
			<div data-testid="custom-below">Filter Bar</div>
		{/snippet}
	</PageToolbar>
{:else}
	<PageToolbar {title} {titleBadge} {variant} {sticky} {breadcrumbs} {subtitle} />
{/if}
