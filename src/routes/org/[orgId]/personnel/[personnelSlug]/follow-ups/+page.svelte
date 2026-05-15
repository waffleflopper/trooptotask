<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { PersonnelFollowUp, PersonnelFollowUpsPageData } from '$features/personnel/personnel-detail.types';

	let { data }: { data: PersonnelFollowUpsPageData } = $props();
	let title = $state('');
	let notes = $state('');
	let dueDate = $state('');
	let saving = $state(false);
	let error = $state('');
	let editingId = $state('');
	let actionId = $state('');
	let localRecords = $state<PersonnelFollowUp[] | null>(null);
	const records = $derived(localRecords ?? data.records);

	function formatDate(value: string | null) {
		if (!value) return 'No due date';
		const date = new Date(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	}

	function resetForm() {
		title = '';
		notes = '';
		dueDate = '';
		editingId = '';
	}

	function startEdit(record: PersonnelFollowUp) {
		error = '';
		editingId = record.id;
		title = record.title;
		notes = record.notes;
		dueDate = record.dueDate ?? '';
	}

	async function submitFollowUp() {
		error = '';
		const trimmedTitle = title.trim();
		if (!trimmedTitle) {
			error = 'Enter a follow-up title.';
			return;
		}

		saving = true;
		try {
			const endpoint = editingId
				? `/org/${data.orgId}/api/personnel/${data.personnelId}/follow-ups/${editingId}`
				: `/org/${data.orgId}/api/personnel/${data.personnelId}/follow-ups`;
			const response = await fetch(endpoint, {
				method: editingId ? 'PATCH' : 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					title: trimmedTitle,
					notes: notes.trim(),
					dueDate: dueDate || null
				})
			});
			if (!response.ok) throw new Error(editingId ? 'Unable to update follow-up.' : 'Unable to add follow-up.');
			const saved = (await response.json()) as PersonnelFollowUp;
			localRecords = editingId
				? records.map((record) => (record.id === saved.id ? saved : record))
				: [saved, ...records];
			resetForm();
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to save follow-up.';
		} finally {
			saving = false;
		}
	}

	async function patchFollowUp(record: PersonnelFollowUp, status: 'open' | 'completed' | 'archived') {
		error = '';
		actionId = record.id;
		try {
			const response = await fetch(`/org/${data.orgId}/api/personnel/${data.personnelId}/follow-ups/${record.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status })
			});
			if (!response.ok) throw new Error('Unable to update follow-up.');
			const updated = (await response.json()) as PersonnelFollowUp;
			localRecords =
				status === 'archived'
					? records.filter((item) => item.id !== record.id)
					: records.map((item) => (item.id === updated.id ? updated : item));
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Unable to update follow-up.';
		} finally {
			actionId = '';
		}
	}
</script>

<main class="p-6">
	<section class="rounded-md border bg-card">
		<div class="border-b p-4">
			<h2 class="text-lg font-semibold">{data.title}</h2>
		</div>
		<div class="space-y-5 p-6">
			<form class="grid gap-3" onsubmit={(event) => (event.preventDefault(), submitFollowUp())}>
				<div class="grid gap-3 md:grid-cols-[1fr_12rem_auto]">
					<Input bind:value={title} aria-label="Follow-up title" placeholder="Follow-up title" />
					<Input bind:value={dueDate} type="date" aria-label="Follow-up due date" />
					<Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save' : 'Add'}</Button>
				</div>
				<Textarea bind:value={notes} rows={3} aria-label="Follow-up notes" placeholder="Optional notes" />
				<div class="flex items-center justify-between gap-3">
					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{:else}
						<p class="text-sm text-muted-foreground">Open and completed follow-ups stay visible until archived.</p>
					{/if}
					{#if editingId}
						<Button type="button" variant="ghost" onclick={resetForm}>Cancel edit</Button>
					{/if}
				</div>
			</form>

			{#if records.length === 0}
				<p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{data.emptyState}</p>
			{:else}
				<div class="divide-y rounded-md border">
					{#each records as record (record.id)}
						<article class="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
							<div>
								<div class="flex flex-wrap items-center gap-2">
									<h3 class="font-medium">{record.title}</h3>
									<span class="rounded-sm border px-2 py-0.5 text-xs text-muted-foreground">{record.status}</span>
								</div>
								<p class="mt-1 text-xs text-muted-foreground">Due {formatDate(record.dueDate)}</p>
								{#if record.notes}
									<p class="mt-2 text-sm leading-relaxed">{record.notes}</p>
								{/if}
							</div>
							<div class="flex flex-wrap items-center gap-2 md:justify-end">
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={actionId === record.id}
									onclick={() => startEdit(record)}
								>
									Edit
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={actionId === record.id}
									onclick={() => patchFollowUp(record, record.status === 'completed' ? 'open' : 'completed')}
								>
									{record.status === 'completed' ? 'Reopen' : 'Complete'}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									disabled={actionId === record.id}
									onclick={() => patchFollowUp(record, 'archived')}
								>
									Archive
								</Button>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</main>
