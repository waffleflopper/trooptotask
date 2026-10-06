<script lang="ts">
	import { resolve } from '$app/paths';
	import { afterNavigate } from '$app/navigation';
	import { mergeProps } from 'bits-ui';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import OrgNavIcon from './OrgNavIcon.svelte';
	import { isOrgNavItemActive, type OrgNavItem } from './orgNavigation';
	let { navItems, pathname }: { navItems: OrgNavItem[]; pathname: string } = $props();
	const sidebar = Sidebar.useSidebar();
	afterNavigate(() => {
		if (sidebar.isMobile) sidebar.setOpenMobile(false);
	});
	function selectLink(event: MouseEvent) {
		if (
			sidebar.isMobile &&
			event.button === 0 &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.shiftKey &&
			!event.altKey &&
			!event.defaultPrevented
		)
			sidebar.setOpenMobile(false);
	}
</script>

<Sidebar.Menu>
	{#each navItems as item (item.href)}
		<Sidebar.MenuItem>
			<Sidebar.MenuButton isActive={isOrgNavItemActive(pathname, item)} tooltipContent={item.label}>
				{#snippet child({ props })}
					{@const linkProps = mergeProps(props, { onclick: selectLink })}
					<a
						{...linkProps}
						href={resolve(item.href as `/org/${string}`)}
						aria-current={isOrgNavItemActive(pathname, item) ? 'page' : undefined}
					>
						<OrgNavIcon icon={item.icon} />
						<span>{item.compactLabel ?? item.label}</span>
						{#if item.badgeLabel}
							<Sidebar.MenuBadge>{item.badgeLabel}</Sidebar.MenuBadge>
						{/if}
					</a>
				{/snippet}
			</Sidebar.MenuButton>
		</Sidebar.MenuItem>
	{/each}
</Sidebar.Menu>
