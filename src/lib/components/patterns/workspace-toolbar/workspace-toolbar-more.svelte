<script lang="ts" module>
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		isFilterActive,
		type ToolbarAction,
		type ToolbarFilter,
		type ToolbarMenuItem,
		type ToolbarView
	} from './toolbar-types.js';
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
		/** Names the trigger "Filters" instead of More, for a toolbar whose filters all live in the menu. */
		filtersLabel?: boolean;
		run: RunAction;
	};

	let { ariaLabel, views, filters, actions, filtersLabel = false, run }: Props = $props();
	const descriptionId = $props.id();
	const hiddenActive = $derived(filters.filter(isFilterActive).map((filter) => filter.label));

	function optionLabel(filter: { options: { value: string; label: string }[] }, value: string): string {
		return filter.options.find((option) => option.value === value)?.label ?? value;
	}

	function toggleValue(values: string[], value: string, checked: boolean): string[] {
		return checked ? [...new Set([...values, value])] : values.filter((item) => item !== value);
	}
</script>

{#snippet moreButton(label: string, props: Record<string, unknown>, describedBy?: string, filtersLabel = false)}
	<Button
		variant="outline"
		size={filtersLabel ? 'default' : 'icon'}
		class="relative"
		aria-label={filtersLabel ? undefined : label}
		aria-describedby={describedBy}
		{...props}
	>
		{#if filtersLabel}
			<ListFilter aria-hidden="true" />
			Filters
		{:else}
			<MoreHorizontal aria-hidden="true" />
		{/if}
		{#if describedBy}
			<span aria-hidden="true" class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent ring-2 ring-card"
			></span>
		{/if}
	</Button>
{/snippet}

{#snippet actionItem(
	action: ToolbarAction,
	path: string[],
	blocked: boolean,
	choose: Choose,
	run: RunAction,
	reserveIcon: boolean
)}
	{@const unavailable = blocked || action.disabled || action.loading}
	{#if action.menuItems}
		<DropdownMenu.Sub>
			<DropdownMenu.SubTrigger disabled={unavailable} title={action.disabledReason}>
				<WorkspaceToolbarIcon icon={action.icon} reserve={reserveIcon} />
				{action.label}
			</DropdownMenu.SubTrigger>
			<DropdownMenu.SubContent class="max-w-(--bits-menu-content-available-width)">
				{@render actionItems(action.menuItems, [...path, action.id], Boolean(unavailable), choose, run)}
			</DropdownMenu.SubContent>
		</DropdownMenu.Sub>
	{:else}
		{@const itemDescriptionId = action.description ? `toolbar-menu-${[...path, action.id].join('-')}` : undefined}
		<DropdownMenu.Item
			variant={action.destructive ? 'destructive' : 'default'}
			aria-label={action.description ? (action.ariaLabel ?? action.label) : undefined}
			aria-describedby={itemDescriptionId}
			disabled={unavailable}
			title={action.disabledReason}
			aria-busy={action.loading || undefined}
			onclick={() => choose(() => run([...path, action.id]))}
		>
			{#if action.loading}
				<Spinner aria-hidden="true" />
			{:else}
				<WorkspaceToolbarIcon icon={action.icon} reserve={reserveIcon} />
			{/if}
			{#if action.description}
				<span class="grid gap-0.5" aria-hidden="true">
					<span class="font-medium">{action.label}</span>
					<span id={itemDescriptionId} class="text-xs text-muted-foreground">{action.description}</span>
				</span>
			{:else}
				{action.label}
			{/if}
		</DropdownMenu.Item>
	{/if}
{/snippet}

{#snippet actionItems(items: ToolbarMenuItem[], path: string[], blocked: boolean, choose: Choose, run: RunAction)}
	{@const destructive = items.filter((item) => item.kind === 'action' && item.destructive) as ToolbarAction[]}
	{@const reserveIcon = items.some((item) => item.kind === 'action' && item.icon)}
	{@const regular = items.filter((item) => item.kind !== 'action' || !item.destructive)}
	{#each regular as item, index (item.id)}
		{#if item.kind === 'select'}
			{#if index > 0}
				<DropdownMenu.Separator />
			{/if}
			<DropdownMenu.RadioGroup value={item.value} onValueChange={item.onValueChange}>
				<DropdownMenu.GroupHeading class="text-xs font-medium text-muted-foreground"
					>{item.label}</DropdownMenu.GroupHeading
				>
				{#each item.options as option (option.value)}
					<DropdownMenu.RadioItem
						value={option.value}
						disabled={blocked}
						closeOnSelect={false}
						aria-label={option.ariaLabel}
					>
						{option.label}
					</DropdownMenu.RadioItem>
				{/each}
			</DropdownMenu.RadioGroup>
			{#if index < regular.length - 1}
				<DropdownMenu.Separator />
			{/if}
		{:else if item.kind === 'toggle'}
			<DropdownMenu.CheckboxItem
				checked={item.pressed}
				disabled={blocked}
				closeOnSelect={false}
				aria-label={item.ariaLabel}
				onCheckedChange={item.onPressedChange}
			>
				{item.label}
			</DropdownMenu.CheckboxItem>
		{:else}
			{@render actionItem(item, path, blocked, choose, run, reserveIcon)}
		{/if}
	{/each}
	{#if destructive.length > 0}
		<DropdownMenu.Separator />
		{#each destructive as action (action.id)}
			{@render actionItem(action, path, blocked, choose, run, reserveIcon)}
		{/each}
	{/if}
{/snippet}

<WorkspaceToolbarMenu contentClass="w-auto min-w-48">
	{#snippet trigger(props)}
		{@render moreButton(`More ${ariaLabel}`, props, hiddenActive.length > 0 ? descriptionId : undefined, filtersLabel)}
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
							<DropdownMenu.RadioItem value={option.value} disabled={view.disabled} title={view.disabledReason}>
								{option.ariaLabel ?? option.label}{typeof option.count === 'number' ? ` ${option.count}` : ''}
							</DropdownMenu.RadioItem>
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
							{#if active}
								<span aria-hidden="true" class="ml-auto size-2 rounded-full bg-accent"></span>
							{/if}
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
							<DropdownMenu.SubContent class="max-w-(--bits-menu-content-available-width)">
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
