<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { PersonnelFollowUp, PersonnelFollowUpsPageData } from '$features/personnel/personnel-detail.types';
	import { ArtifactDraft } from '$features/personnel/workspace/artifactDraft.svelte';
	import { followUpDraftSpec } from '$features/personnel/workspace/personnelArtifactDraftSpecs';

	let { data }: { data: PersonnelFollowUpsPageData } = $props();
	const followUps = new ArtifactDraft(followUpDraftSpec, {
		context: () => ({ orgId: data.orgId, personId: data.personnelId }),
		fetch: (input, init) => fetch(input, init)
	});
	let editingId = $state('');
	let actionId = $state('');
	let archivedRecordIds = $state<string[]>([]);
	const records = $derived(
		followUps.mergeLoaded(data.records).filter((record) => !archivedRecordIds.includes(record.id))
	);

	function formatDate(value: string | null) {
		if (!value) return 'No due date';
		const date = new Date(`${value}T00:00:00`);
		if (Number.isNaN(date.getTime())) return value;
		return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	}

	function resetForm() {
		followUps.fields = followUpDraftSpec.createEmptyInput();
		editingId = '';
	}

	function startEdit(record: PersonnelFollowUp) {
		followUps.error = '';
		editingId = record.id;
		followUps.fields = {
			title: record.title,
			notes: record.notes,
			dueDate: record.dueDate ?? ''
		};
	}

	async function submitFollowUp() {
		followUps.error = '';
		if (!editingId) {
			await followUps.submit();
			return;
		}

		const validationError = followUpDraftSpec.validate(followUps.fields);
		if (validationError) {
			followUps.error = validationError;
			return;
		}

		followUps.saving = true;
		try {
			const request = followUpDraftSpec.encode(followUps.fields);
			const response = await fetch(`/org/${data.orgId}/api/personnel/${data.personnelId}/follow-ups/${editingId}`, {
				method: 'PATCH',
				headers: request.headers,
				body: request.body
			});
			if (!response.ok) throw new Error('Unable to update follow-up.');
			const saved = (await response.json()) as PersonnelFollowUp;
			followUps.upsert(saved);
			resetForm();
		} catch (caught) {
			followUps.error = caught instanceof Error ? caught.message : 'Unable to save follow-up.';
		} finally {
			followUps.saving = false;
		}
	}

	async function patchFollowUp(record: PersonnelFollowUp, status: 'open' | 'completed' | 'archived') {
		followUps.error = '';
		actionId = record.id;
		try {
			const response = await fetch(`/org/${data.orgId}/api/personnel/${data.personnelId}/follow-ups/${record.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status })
			});
			if (!response.ok) throw new Error('Unable to update follow-up.');
			const updated = (await response.json()) as PersonnelFollowUp;
			followUps.upsert(updated);
			if (status === 'archived') {
				archivedRecordIds = [...archivedRecordIds, record.id];
				if (editingId === record.id) resetForm();
			}
		} catch (caught) {
			followUps.error = caught instanceof Error ? caught.message : 'Unable to update follow-up.';
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
					<Input bind:value={followUps.fields.title} aria-label="Follow-up title" placeholder="Follow-up title" />
					<DatePicker bind:value={followUps.fields.dueDate} aria-label="Follow-up due date" placeholder="Due date" />
					<Button type="submit" disabled={followUps.saving}>
						{followUps.saving ? 'Saving...' : editingId ? 'Save' : 'Add'}
					</Button>
				</div>
				<Textarea
					bind:value={followUps.fields.notes}
					rows={3}
					aria-label="Follow-up notes"
					placeholder="Optional notes"
				/>
				<div class="flex items-center justify-between gap-3">
					{#if followUps.error}
						<p class="text-sm text-destructive">{followUps.error}</p>
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
