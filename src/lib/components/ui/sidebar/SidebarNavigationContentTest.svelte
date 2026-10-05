<script lang="ts">
	import * as Sidebar from './index.js';

	let { cancelNavigation = false }: { cancelNavigation?: boolean } = $props();
	const sidebar = Sidebar.useSidebar();
	let callerInteraction = $state('');
</script>

<Sidebar.Trigger />
<Sidebar.MenuButton
	isActive
	tooltipContent="Users"
	onclick={(event) => {
		callerInteraction = 'users';
		if (cancelNavigation) event.preventDefault();
	}}
>
	{#snippet child({ props })}
		<a {...props} href="#users" aria-current="page">Users</a>
	{/snippet}
</Sidebar.MenuButton>
<Sidebar.MenuButton tooltipContent="Dashboard" onclick={() => (callerInteraction = 'dashboard')}>
	{#snippet child({ props })}
		<a {...props} href="#dashboard">Dashboard</a>
	{/snippet}
</Sidebar.MenuButton>
<Sidebar.MenuButton onclick={() => (callerInteraction = 'account')}>Account</Sidebar.MenuButton>
<Sidebar.MenuButton>
	{#snippet child({ props })}
		<a {...props} role="button" tabindex="0">Action without destination</a>
	{/snippet}
</Sidebar.MenuButton>

<output aria-label="Mobile navigation">{sidebar.openMobile ? 'open' : 'closed'}</output>
<output aria-label="Desktop navigation">{sidebar.open ? 'open' : 'closed'}</output>
<output aria-label="Viewport">{sidebar.isMobile ? 'mobile' : 'desktop'}</output>
<output aria-label="Caller interaction">{callerInteraction}</output>
