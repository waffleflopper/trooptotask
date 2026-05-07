<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { MoreHorizontal } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import WorkspaceToolbarIcon from './workspace-toolbar-icon.svelte';
	import type { WorkspaceToolbarAction, WorkspaceToolbarMenuItem } from './types.js';

	type Props = {
		actions: WorkspaceToolbarAction[];
		ariaLabel?: string;
		overflowAriaLabel: string;
	};

	let { actions, ariaLabel, overflowAriaLabel }: Props = $props();

	const visibleActions = $derived(actions.filter((action) => action.overflow !== 'always'));
	const overflowActions = $derived(actions.filter((action) => action.overflow === 'always'));

	function buttonVariant(action: WorkspaceToolbarAction): 'default' | 'outline' | 'secondary' | 'destructive' {
		if (action.variant === 'primary') return 'default';
		if (action.variant === 'secondary') return 'secondary';
		if (action.variant === 'danger') return 'destructive';
		return 'outline';
	}

	function menuItemDisabled(item: WorkspaceToolbarMenuItem, parent?: WorkspaceToolbarAction): boolean {
		return Boolean(parent?.disabled || item.disabled);
	}

	function handleMenuItemSelect(item: WorkspaceToolbarMenuItem, parent?: WorkspaceToolbarAction): void {
		if (menuItemDisabled(item, parent)) return;
		if (item.href) {
			void goto(resolve(item.href as '/'));
			return;
		}
		item.onclick?.();
	}

	function handleActionSelect(action: WorkspaceToolbarAction): void {
		if (action.disabled) return;
		if (action.href) {
			void goto(resolve(action.href as '/'));
			return;
		}
		action.onclick?.();
	}
</script>

<div data-slot="workspace-toolbar-actions" data-label={ariaLabel} class="contents">
	{#each visibleActions as action (action.id)}
		{#if action.menuItems?.length}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							variant={buttonVariant(action)}
							disabled={action.disabled}
							title={action.disabledReason}
							aria-label={action.label}
							{...props}
						>
							<WorkspaceToolbarIcon icon={action.icon} />
							<span>{action.label}</span>
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Label>{action.label}</DropdownMenu.Label>
					{#each action.menuItems as item, index (`${action.id}-${item.label}-${index}`)}
						{#if item.toggle}
							<DropdownMenu.CheckboxItem
								checked={item.active}
								disabled={menuItemDisabled(item, action)}
								onclick={() => handleMenuItemSelect(item, action)}
							>
								{item.label}
							</DropdownMenu.CheckboxItem>
						{:else}
							<DropdownMenu.Item
								disabled={menuItemDisabled(item, action)}
								title={item.disabledReason ?? action.disabledReason}
								onclick={() => handleMenuItemSelect(item, action)}
							>
								{item.label}
							</DropdownMenu.Item>
						{/if}
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{:else}
			<Button
				variant={buttonVariant(action)}
				href={action.href}
				disabled={action.disabled}
				title={action.disabledReason}
				aria-pressed={action.toggle ? action.active : undefined}
				onclick={action.onclick}
			>
				<WorkspaceToolbarIcon icon={action.icon} />
				<span>{action.label}</span>
			</Button>
		{/if}
	{/each}

	{#if overflowActions.length > 0}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button variant="outline" size="icon" aria-label={overflowAriaLabel} {...props}>
						<MoreHorizontal aria-hidden="true" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
				<DropdownMenu.Label>{overflowAriaLabel}</DropdownMenu.Label>
				{#each overflowActions as action (action.id)}
					{#if action.toggle}
						<DropdownMenu.CheckboxItem
							checked={action.active}
							disabled={action.disabled}
							title={action.disabledReason}
							onclick={() => {
								if (!action.disabled) action.onclick?.();
							}}
						>
							{action.label}
						</DropdownMenu.CheckboxItem>
					{:else}
						<DropdownMenu.Item
							disabled={action.disabled}
							title={action.disabledReason}
							onclick={() => handleActionSelect(action)}
						>
							<WorkspaceToolbarIcon icon={action.icon} />
							{action.label}
						</DropdownMenu.Item>
					{/if}
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
</div>
