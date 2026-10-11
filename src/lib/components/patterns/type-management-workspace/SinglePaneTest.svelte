<script lang="ts">
	import { tick } from 'svelte';
	import * as TypeManagementWorkspace from './index.js';
	import { Button } from '$lib/components/ui/button';

	const names = $state(['Annual Qualification', 'CPR']);
	let selected = $state(names[0]);
	let detailOpen = $state(false);
	let list = $state<ReturnType<typeof TypeManagementWorkspace.ItemList>>();

	async function create() {
		names.push('Range Day');
		selected = 'Range Day';
		detailOpen = true;
		await tick();
		list?.focusSelected();
	}
</script>

<TypeManagementWorkspace.Root aria-label="Single pane test">
	<Button type="button" onclick={create}>Create</Button>
	<TypeManagementWorkspace.Layout>
		<TypeManagementWorkspace.List mobileHidden={detailOpen}>
			<TypeManagementWorkspace.ItemList bind:this={list} aria-label="Types">
				{#each names as name (name)}
					<TypeManagementWorkspace.ListItem
						title={name}
						selected={selected === name}
						onselect={() => {
							selected = name;
							detailOpen = true;
						}}
					/>
				{/each}
			</TypeManagementWorkspace.ItemList>
		</TypeManagementWorkspace.List>
		<TypeManagementWorkspace.Detail mobileHidden={!detailOpen}>
			<TypeManagementWorkspace.MobileBack onclick={() => (detailOpen = false)}>Types</TypeManagementWorkspace.MobileBack
			>
			<TypeManagementWorkspace.DetailHeader title={selected} />
		</TypeManagementWorkspace.Detail>
	</TypeManagementWorkspace.Layout>
</TypeManagementWorkspace.Root>
