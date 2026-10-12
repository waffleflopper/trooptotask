<script lang="ts" module>
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Spinner } from '$lib/components/ui/spinner';
	import { isFilterActive, type ToolbarAction, type ToolbarFilter, type ToolbarView } from './toolbar-types.js';
	import WorkspaceToolbarIcon from './workspace-toolbar-icon.svelte';
	import WorkspaceToolbarMenu from './workspace-toolbar-menu.svelte';

	export type RunAction = (path: string[]) => void;
	type Choose = (action: () => void) => void;

	export { actionItems, moreButton };
</script>

<script lang="ts">
	type Props = {
		ariaLabel: string;
		views: ToolbarView[];
		filters: ToolbarFilter[];
		/** Folded actions in row order, menu-only actions included. */
		actions: ToolbarAction[];
		run: RunAction;
	};

	let { ariaLabel, views, filters, actions, run }: Props = $props();
	const descriptionId = $props.id();
	const hiddenActive = $derived(filters.filter(isFilterActive).map((filter) => filter.label));

	function optionLabel(filter: { options: { value: string; label: string }[] }, value: string): string {
		return filter.options.find((option) => option.value === value)?.label ?? value;
	}

	function toggleValue(values: string[], value: string, checked: boolean): string[] {
		return checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
	}
</script>

{#snippet moreButton(label: string, props: Record<string, unknown>, describedBy?: string)}
	<Button variant="outline" size="icon" class="relative" aria-label={label} aria-describedby={describedBy} {...props}>
		<MoreHorizontal aria-hidden="true" />
		{#if describedBy}
			<span aria-hidden="true" class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent ring-2 ring-card"
			></span>
		{/if}
	</Button>
{/snippet}

{#snippet actionItem(action: ToolbarAction, path: string[], blocked: boolean, choose: Choose, run: RunAction)}
	{@const unavailable = blocked || action.disabled || action.loading}
	{#if action.menuItems}
		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger disabled={unavailable} title={action.disabledReason}>
				<WorkspaceToolbarIcon icon={action.icon} />
				{action.label}
			</DropdownMenu.SubTrigger>
			<DropdownMenu.SubContent>
				{@render actionItems(action.menuItems, [...path, action.id], Boolean(unavailable), choose, run)}
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>
	{:else}
		<DropdownMenu.Item
			variant={action.destructive ? 'destructive' : 'default'}
			disabled={unavailable}
			title={action.disabledReason}
			aria-busy={action.loading || undefined}
			onclick={() => choose(() => run([...path, action.id]))}
		>
			{#if action.loading}
				<Spinner aria-hidden="true" />
			{:else}
				<WorkspaceToolbarIcon icon={action.icon} />
			{/if}
			{action.label}
		</DropdownMenu.Item>
	{/if}
{/snippet}

{#snippet actionItems(actions: ToolbarAction[], path: string[], blocked: boolean, choose: Choose, run: RunAction)}
	{@const destructive = actions.filter((action) => action.destructive)}
	{#each actions.filter((action) => !action.destructive) as action (action.id)}
		{@render actionItem(action, path, blocked, choose, run)}
	{/each}
	{#if destructive.length > 0}
		<DropdownMenu.Separator />
		{#each destructive as action (action.id)}
			{@render actionItem(action, path, blocked, choose, run)}
		{/each}
	{/if}
{/snippet}

<WorkspaceToolbarMenu contentClass="w-auto min-w-48">
	{#snippet trigger(props)}
		{@render moreButton(`More ${ariaLabel}`, props, hiddenActive.length > 0 ? descriptionId : undefined)}
	{/snippet}
	{#snippet children(choose)}
		{#if views.length > 0}
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading>View</DropdownMenu.GroupHeading>
				{#each views as view (view.id)}
					<DropdownMenu.RadioGroup
						aria-label={view.ariaLabel ?? view.label}
						value={view.value}
						onValueChange={view.onValueChange}
					>
						{#each view.options as option (option.value)}
							<DropdownMenu.RadioItem value={option.value}>{option.label}</DropdownMenu.RadioItem>
						{/each}
					</DropdownMenu.RadioGroup>
				{/each}
			</DropdownMenu.Group>
		{/if}
		{#if filters.length > 0}
			{#if views.length > 0}
				<DropdownMenu.Separator />
			{/if}
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading>Filters</DropdownMenu.GroupHeading>
				{#each filters as filter (filter.id)}
					{@const active = isFilterActive(filter)}
					{#if filter.kind === 'toggle'}
						<DropdownMenu.CheckboxItem checked={filter.pressed} onCheckedChange={filter.onPressedChange}>
							{filter.label}
						</DropdownMenu.CheckboxItem>
					{:else}
						{@const current =
							filter.kind === 'select'
								? optionLabel(filter, filter.value)
								: filter.values.length > 0
									? `${filter.values.length} selected`
									: ''}
						<DropdownMenu.Sub>
							<DropdownMenu.SubTrigger aria-label={current ? `${filter.label}, ${current}` : filter.label}>
								{filter.label}
								<span class="ml-auto flex items-center gap-1.5 pl-3 text-muted-foreground">
									{#if active}
										<span aria-hidden="true" class="size-2 rounded-full bg-accent"></span>
									{/if}
									{current}
								</span>
							</DropdownMenu.SubTrigger>
							<DropdownMenu.SubContent>
								{#if filter.kind === 'select'}
									<DropdownMenu.RadioGroup
										aria-label={filter.label}
										value={filter.value}
										onValueChange={filter.onValueChange}
									>
										{#each filter.options as option (option.value)}
											<DropdownMenu.RadioItem value={option.value}>{option.label}</DropdownMenu.RadioItem>
										{/each}
									</DropdownMenu.RadioGroup>
								{:else}
									{#each filter.options as option (option.value)}
										<DropdownMenu.CheckboxItem
											checked={filter.values.includes(option.value)}
											closeOnSelect={false}
											onCheckedChange={(checked) =>
												filter.onValuesChange(toggleValue(filter.values, option.value, checked))}
										>
											{option.label}
										</DropdownMenu.CheckboxItem>
									{/each}
								{/if}
							</DropdownMenu.SubContent>
						</DropdownMenu.Sub>
					{/if}
				{/each}
			</DropdownMenu.Group>
		{/if}
		{#if actions.length > 0}
			{#if views.length > 0 || filters.length > 0}
				<DropdownMenu.Separator />
			{/if}
			<DropdownMenu.Group>
				<DropdownMenu.GroupHeading>Actions</DropdownMenu.GroupHeading>
				{@render actionItems(actions, [], false, choose, run)}
			</DropdownMenu.Group>
		{/if}
	{/snippet}
</WorkspaceToolbarMenu>
{#if hiddenActive.length > 0}
	<span id={descriptionId} class="sr-only">Hidden filters active: {hiddenActive.join(', ')}</span>
{/if}
