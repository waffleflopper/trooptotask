<script lang="ts">
	import ToolbarMetaItem from './ToolbarMetaItem.svelte';
	import ToolbarNavGroup from './ToolbarNavGroup.svelte';

	interface Props {
		compact?: boolean;
		pending?: boolean;
	}

	let { compact = false, pending = false }: Props = $props();

	const navItems = [
		{ label: 'Approvals', href: '/org/org-1/settings/approvals', active: true },
		{ label: 'Archived Personnel', href: '/org/org-1/settings/archived' },
		{
			label: 'Locked Settings',
			href: '/org/org-1/settings/policies',
			disabled: true,
			disabledReason: 'Upgrade to edit'
		}
	];
</script>

<ToolbarNavGroup ariaLabel="Organization settings sections" items={navItems} {compact} />
<ToolbarMetaItem label={pending ? 'Unsaved changes' : 'Saved'} tone={pending ? 'warning' : 'default'} />
