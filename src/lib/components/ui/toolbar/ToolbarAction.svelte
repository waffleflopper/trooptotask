<script lang="ts">
	import { dev } from '$app/environment';
	import ToolbarOverflowMenu from '$lib/components/ui/ToolbarOverflowMenu.svelte';
	import ToolbarIcon from './ToolbarIcon.svelte';
	import { getLayoutModeClass } from './toolbarLayout';
	import { getToolbarActionVariant, type ToolbarAction, type ToolbarActionLayoutMode } from './toolbar.types';

	interface Props {
		action: ToolbarAction;
		mode: Exclude<ToolbarActionLayoutMode, 'overflow'>;
		descriptionIdSuffix?: string;
	}

	let { action, mode, descriptionIdSuffix = '' }: Props = $props();

	const compact = $derived(mode === 'compact');
	const labelledById = $derived(
		action.disabledReason ? `toolbar-action-${action.id}${descriptionIdSuffix}-reason` : undefined
	);
	const actionClass = $derived(
		[
			'toolbar-action',
			getLayoutModeClass(mode),
			'btn',
			'btn-sm',
			compact ? 'btn-icon' : '',
			getToolbarActionVariant(action) === 'primary' ? 'btn-primary' : '',
			getToolbarActionVariant(action) === 'secondary' ? 'btn-secondary' : '',
			getToolbarActionVariant(action) === 'danger' ? 'btn-danger' : ''
		]
			.filter(Boolean)
			.join(' ')
	);

	$effect(() => {
		if (!dev) return;
		if (action.href && action.onclick) {
			console.warn(`[ToolbarAction] ${action.id} must use either href or onclick, not both.`);
		} else if (!action.href && !action.onclick && !action.menuItems?.length) {
			console.warn(`[ToolbarAction] ${action.id} must provide either href or onclick.`);
		}
	});
</script>

{#if action.menuItems?.length}
	<div class="toolbar-action-menu">
		<ToolbarOverflowMenu
			ariaLabel={action.label}
			label={action.label}
			icon={action.icon}
			idSeed={`toolbar-action-menu-${action.id}${descriptionIdSuffix}`}
			iconOnly={compact}
			disabled={action.disabled}
			disabledReason={action.disabledReason}
			items={action.menuItems.map((item) => ({
				...item,
				disabled: action.disabled || item.disabled,
				disabledReason: action.disabledReason ?? item.disabledReason
			}))}
		/>
	</div>
{:else if action.href && action.disabled}
	<span
		class={actionClass}
		class:disabled={action.disabled}
		aria-label={compact ? action.label : undefined}
		aria-disabled="true"
		aria-describedby={labelledById}
		title={compact || action.disabledReason ? (action.disabledReason ?? action.label) : undefined}
	>
		{#if action.icon}
			<ToolbarIcon icon={action.icon} />
		{/if}
		{#if !compact}
			<span>{action.label}</span>
		{/if}
	</span>
{:else if action.href}
	<a
		class={actionClass}
		href={action.href}
		aria-label={compact ? action.label : undefined}
		aria-describedby={labelledById}
		title={compact || action.disabledReason ? (action.disabledReason ?? action.label) : undefined}
	>
		{#if action.icon}
			<ToolbarIcon icon={action.icon} />
		{/if}
		{#if !compact}
			<span>{action.label}</span>
		{/if}
	</a>
{:else}
	<button
		class={actionClass}
		type="button"
		onclick={action.onclick}
		disabled={action.disabled}
		aria-label={compact ? action.label : undefined}
		aria-describedby={labelledById}
		title={compact || action.disabledReason ? (action.disabledReason ?? action.label) : undefined}
	>
		{#if action.icon}
			<ToolbarIcon icon={action.icon} />
		{/if}
		{#if !compact}
			<span>{action.label}</span>
		{/if}
	</button>
{/if}

{#if action.disabledReason}
	<span id={labelledById} class="toolbar-action__reason">{action.disabledReason}</span>
{/if}

<style>
	.toolbar-action {
		position: relative;
	}

	.toolbar-action-menu {
		display: inline-flex;
	}

	.toolbar-action.disabled {
		opacity: var(--opacity-heavy);
		cursor: not-allowed;
		box-shadow: none;
		transform: none;
	}

	.toolbar-action__reason {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
