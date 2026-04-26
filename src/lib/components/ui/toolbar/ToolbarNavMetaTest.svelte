<script lang="ts">
	import ToolbarMetaItem from './ToolbarMetaItem.svelte';
	import ToolbarNavGroup from './ToolbarNavGroup.svelte';

	interface Props {
		compact?: boolean;
		pending?: boolean;
	}

	let { compact = false, pending = false }: Props = $props();

	const navItems = [
		{ label: 'Approvals', href: '/org/org-1/admin/approvals', active: true },
		{ label: 'Archived Personnel', href: '/org/org-1/admin/archived' }
	];
</script>

<ToolbarNavGroup ariaLabel="Admin sections" items={navItems} {compact} />
<ToolbarMetaItem label={pending ? 'Unsaved changes' : 'Saved'} tone={pending ? 'warning' : 'default'} />
