<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		ariaLabel: string;
		leadingMin?: string;
		collapse?: 'wide' | 'medium' | 'narrow';
		leading?: Snippet;
		children?: Snippet;
		overflow?: Snippet;
	}

	let { ariaLabel, leadingMin = '18rem', collapse = 'wide', leading, children, overflow }: Props = $props();

	const toolbarClass = $derived(
		[
			'floating-page-toolbar',
			`floating-page-toolbar--${collapse}`,
			overflow ? 'floating-page-toolbar--has-overflow' : ''
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<div
	role="toolbar"
	class={toolbarClass}
	aria-label={ariaLabel}
	data-floating-page-toolbar
	data-testid="floating-page-toolbar"
	style:--toolbar-leading-min={leadingMin}
>
	<div class="floating-page-toolbar__leading">
		{#if leading}
			{@render leading()}
		{/if}
	</div>

	{#if children}
		<div class="floating-page-toolbar__actions">
			{@render children()}
		</div>
	{/if}

	{#if overflow}
		<div class="floating-page-toolbar__overflow">
			{@render overflow()}
		</div>
	{/if}
</div>

<style>
	.floating-page-toolbar {
		display: grid;
		grid-template-columns: minmax(var(--toolbar-leading-min), 1fr) auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
	}

	.floating-page-toolbar__leading,
	.floating-page-toolbar__actions,
	.floating-page-toolbar__overflow {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.floating-page-toolbar__leading {
		justify-content: flex-start;
	}

	.floating-page-toolbar__actions {
		justify-content: flex-end;
	}

	.floating-page-toolbar__overflow {
		display: none;
		justify-content: flex-end;
	}

	.floating-page-toolbar--has-overflow {
		grid-template-columns: minmax(var(--toolbar-leading-min), 1fr) auto auto;
	}

	@media (max-width: 1180px) {
		.floating-page-toolbar--wide {
			grid-template-columns: 1fr;
			align-items: stretch;
		}

		.floating-page-toolbar--wide .floating-page-toolbar__actions {
			justify-content: flex-start;
		}

		.floating-page-toolbar--has-overflow.floating-page-toolbar--wide {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
		}

		.floating-page-toolbar--has-overflow.floating-page-toolbar--wide .floating-page-toolbar__actions {
			display: none;
		}

		.floating-page-toolbar--has-overflow.floating-page-toolbar--wide .floating-page-toolbar__overflow {
			display: flex;
		}
	}

	@media (max-width: 1024px) {
		.floating-page-toolbar--medium {
			grid-template-columns: 1fr;
			align-items: stretch;
		}

		.floating-page-toolbar--medium .floating-page-toolbar__actions {
			justify-content: flex-start;
		}

		.floating-page-toolbar--has-overflow.floating-page-toolbar--medium {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
		}

		.floating-page-toolbar--has-overflow.floating-page-toolbar--medium .floating-page-toolbar__actions {
			display: none;
		}

		.floating-page-toolbar--has-overflow.floating-page-toolbar--medium .floating-page-toolbar__overflow {
			display: flex;
		}
	}

	@media (max-width: 640px) {
		.floating-page-toolbar--narrow {
			grid-template-columns: 1fr;
			align-items: stretch;
		}

		.floating-page-toolbar--narrow .floating-page-toolbar__actions {
			justify-content: flex-start;
		}

		.floating-page-toolbar--has-overflow.floating-page-toolbar--narrow {
			grid-template-columns: minmax(0, 1fr) auto;
			align-items: center;
		}

		.floating-page-toolbar--has-overflow.floating-page-toolbar--narrow .floating-page-toolbar__actions {
			display: none;
		}

		.floating-page-toolbar--has-overflow.floating-page-toolbar--narrow .floating-page-toolbar__overflow {
			display: flex;
		}
	}
</style>
