<script lang="ts">
	import { resolve } from '$app/paths';
	import { afterNavigate } from '$app/navigation';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import OrgNavIcon from './OrgNavIcon.svelte';
	import { isOrgNavItemActive, isOrgNavSubItemActive, type OrgNavItem } from './orgNavigation';
	let { navItems, pathname }: { navItems: OrgNavItem[]; pathname: string } = $props();
	const sidebar = Sidebar.useSidebar();
	const linkName = (item: OrgNavItem) => item.compactLabel ?? item.label;
	// Collapsed to icons, the sub-items hide, so the section icon carries the current page.
	const showsSubItems = $derived(sidebar.isMobile || sidebar.state === 'expanded');
	afterNavigate(() => {
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	});
</script>

<Sidebar.Menu>
	{#each navItems as item (item.href)}
		{@const children = item.children?.filter((sub) => sub.visible) ?? []}
		{@const childActive = children.some((sub) => isOrgNavSubItemActive(pathname, sub))}
		{@const itemActive = isOrgNavItemActive(pathname, item)}
		<Sidebar.MenuItem>
			<Sidebar.MenuButton isActive={itemActive && !(childActive && showsSubItems)} tooltipContent={linkName(item)}>
				{#snippet child({ props })}
					<a
						{...props}
						href={resolve(item.href as `/org/${string}`)}
						aria-current={itemActive && !childActive ? 'page' : undefined}
					>
						<OrgNavIcon icon={item.icon} />
						<span>{linkName(item)}</span>
						{#if item.badgeLabel}
							<Sidebar.MenuBadge>{item.badgeLabel}</Sidebar.MenuBadge>
						{/if}
					</a>
				{/snippet}
			</Sidebar.MenuButton>
			{#if children.length}
				<Sidebar.MenuSub>
					{#each children as sub (sub.id)}
						{@const active = isOrgNavSubItemActive(pathname, sub)}
						<Sidebar.MenuSubItem>
							<Sidebar.MenuSubButton isActive={active}>
								{#snippet child({ props })}
									<a {...props} href={resolve(sub.href as `/org/${string}`)} aria-current={active ? 'page' : undefined}>
										<span>{sub.label}</span>
									</a>
								{/snippet}
							</Sidebar.MenuSubButton>
						</Sidebar.MenuSubItem>
					{/each}
				</Sidebar.MenuSub>
			{/if}
		</Sidebar.MenuItem>
	{/each}
</Sidebar.Menu>
