<script lang="ts">
	import ToolbarMetaItem from './ToolbarMetaItem.svelte';
	import ToolbarNavGroup from './ToolbarNavGroup.svelte';

	interface Props {
		compact?: boolean;
		pending?: boolean;
	}

	let { compact = false, pending = false }: Props = $props();

	const navItems = [
		{ label: 'Overview', href: '/org/org-1/settings', active: true },
		{ label: 'Personnel', href: '/org/org-1/personnel' },
		{
			label: 'Locked Billing',
			href: '/org/org-1/billing',
			disabled: true,
			disabledReason: 'Upgrade to edit'
		}
	];
</script>

<ToolbarNavGroup ariaLabel="Organization sections" items={navItems} {compact} />
<ToolbarMetaItem label={pending ? 'Unsaved changes' : 'Saved'} tone={pending ? 'warning' : 'default'} />
