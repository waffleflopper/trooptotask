<!-- src/lib/components/ui/BulkImportTable.svelte -->
<script lang="ts">
  import type { ColumnDef, ColumnMapping } from '$lib/utils/columnMapping';
  import { autoMapColumns, detectHeaderRow, getMissingRequired } from '$lib/utils/columnMapping';
  import { SvelteSet, SvelteMap } from 'svelte/reactivity';

  interface RowValidation {
    valid: boolean;
    cellErrors: Record<string, string>;
    cellWarnings: Record<string, string>;
  }

  interface Props {
    rawRows: string[][];
    columnDefs: ColumnDef[];
    validateRow: (row: Record<string, string>) => RowValidation;
    onMappingChange?: (mappings: ColumnMapping[]) => void;
  }

  let { rawRows, columnDefs, validateRow, onMappingChange }: Props = $props();

  // Detect headers and auto-map columns as derived values
  const hasHeaders = $derived(
    rawRows.length > 0 ? detectHeaderRow(rawRows[0], columnDefs) : false
  );

  // Base mappings derived from raw data — user edits are overlaid via userMappings
  const autoMappings = $derived(
    rawRows.length > 0 ? autoMapColumns(rawRows[0], columnDefs, hasHeaders) : []
  );

  // User-overridden mappings: fieldKey per columnIndex
  let userOverrides = new SvelteMap<number, string | null>();

  // Reset overrides when rawRows change (new file loaded)
  $effect(() => {
    rawRows; // track dependency
    userOverrides.clear();
  });

  const mappings = $derived.by(() => {
    return autoMappings.map(m => {
      if (userOverrides.has(m.columnIndex)) {
        return { ...m, fieldKey: userOverrides.get(m.columnIndex) ?? null };
      }
      return m;
    });
  });

  // Notify parent when mappings change
  $effect(() => {
    onMappingChange?.(mappings);
  });

  const dataRows = $derived(hasHeaders ? rawRows.slice(1) : rawRows);
  const missingRequired = $derived(getMissingRequired(mappings, columnDefs));

  // editableRows starts as a copy of dataRows; user edits mutate it directly
  let editableRows = $state<string[][]>([]);

  $effect(() => {
    // Only reset when dataRows reference changes (new file loaded)
    editableRows = dataRows.map(row => [...row]);
  });

  const rowValidations = $derived.by(() => {
    return editableRows.map(row => {
      const mapped: Record<string, string> = {};
      for (const m of mappings) {
        if (m.fieldKey && m.columnIndex < row.length) {
          mapped[m.fieldKey] = row[m.columnIndex].trim();
        }
      }
      return validateRow(mapped);
    });
  });

  // checkedRows auto-selects valid rows on initial load; user can toggle manually
  let checkedRows = new SvelteSet<number>();

  // Track the last-seen validations so the incremental effect can diff them
  let prevValidations = $state<RowValidation[]>([]);

  // When rawRows changes (new file loaded), reset everything and auto-check all valid rows
  $effect(() => {
    // Depend only on rawRows — editableRows is reset in its own effect first,
    // but rowValidations isn't ready yet, so we clear and let the incremental
    // effect below populate checkedRows on the next tick.
    rawRows; // track dependency
    checkedRows.clear();
    prevValidations = [];
  });

  // Incremental update: when rowValidations changes due to cell edits or mapping
  // changes, only add rows that became valid and remove rows that became invalid.
  // This preserves manual checkbox selections the user made.
  $effect(() => {
    const current = rowValidations;
    const prev = prevValidations;

    if (prev.length === 0 && current.length > 0) {
      // Initial population after a file load — auto-check all valid rows
      current.forEach((v, i) => {
        if (v.valid) checkedRows.add(i);
      });
    } else {
      // Incremental update: only touch rows whose validity changed
      current.forEach((v, i) => {
        const wasValid = prev[i]?.valid ?? false;
        if (!wasValid && v.valid) {
          // Row just became valid: auto-add it (was unchecked because invalid)
          checkedRows.add(i);
        } else if (wasValid && !v.valid) {
          // Row just became invalid: remove it even if user had checked it
          checkedRows.delete(i);
        }
        // If validity didn't change, leave the checkbox alone
      });
    }

    prevValidations = current;
  });

  function toggleRow(index: number) {
    if (checkedRows.has(index)) checkedRows.delete(index);
    else checkedRows.add(index);
  }

  function selectAll() {
    checkedRows.clear();
    rowValidations.forEach((_, i) => checkedRows.add(i));
  }

  function selectNone() {
    checkedRows.clear();
  }

  let editingCell = $state<{ row: number; col: number } | null>(null);

  function commitEdit(row: number, col: number, value: string) {
    editableRows[row][col] = value;
    editableRows = [...editableRows];
    editingCell = null;
  }

  function handleKeydown(e: KeyboardEvent, row: number, col: number) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      commitEdit(row, col, (e.target as HTMLInputElement).value);
    } else if (e.key === 'Escape') {
      editingCell = null;
    }
  }

  function setMapping(colIndex: number, fieldKey: string | null) {
    userOverrides.set(colIndex, fieldKey);
  }

  export function getCheckedRows(): Record<string, string>[] {
    const results: Record<string, string>[] = [];
    editableRows.forEach((row, i) => {
      if (!checkedRows.has(i)) return;
      if (!rowValidations[i]?.valid) return;
      const mapped: Record<string, string> = {};
      for (const m of mappings) {
        if (m.fieldKey && m.columnIndex < row.length) {
          mapped[m.fieldKey] = row[m.columnIndex].trim();
        }
      }
      results.push(mapped);
    });
    return results;
  }

  const readyCount = $derived(
    editableRows.filter((_, i) => checkedRows.has(i) && rowValidations[i]?.valid).length
  );
  const errorCount = $derived(rowValidations.filter(v => !v.valid).length);
  const uncheckedCount = $derived(
    editableRows.filter((_, i) => !checkedRows.has(i) && rowValidations[i]?.valid).length
  );

  const sortedIndices = $derived.by(() => {
    const indices = editableRows.map((_, i) => i);
    indices.sort((a, b) => {
      const aValid = rowValidations[a]?.valid ?? false;
      const bValid = rowValidations[b]?.valid ?? false;
      if (aValid === bValid) return a - b;
      return aValid ? 1 : -1;
    });
    return indices;
  });

  function getAvailableFields(currentColIndex: number): (ColumnDef | null)[] {
    const usedKeys = new Set(
      mappings
        .filter(m => m.fieldKey && m.columnIndex !== currentColIndex)
        .map(m => m.fieldKey)
    );
    return [
      null,
      ...columnDefs.filter(d => !usedKeys.has(d.key))
    ];
  }
</script>

{#if rawRows.length === 0}
  <!-- No data yet, render nothing -->
{:else}
  {#if missingRequired.length > 0}
    <div class="mapping-warning">
      Missing required columns: {missingRequired.map(d => d.label).join(', ')}
    </div>
  {/if}

  <div class="mapping-row">
    {#each mappings as mapping, i (mapping.columnIndex)}
      <div class="mapping-col">
        <div class="mapping-header">{rawRows[0][mapping.columnIndex] ?? `Col ${i + 1}`}</div>
        <select
          class="select mapping-select"
          value={mapping.fieldKey ?? ''}
          onchange={(e) => setMapping(mapping.columnIndex, e.currentTarget.value || null)}
        >
          {#each getAvailableFields(mapping.columnIndex) as field (field?.key ?? '__skip__')}
            {#if field === null}
              <option value="">Skip</option>
            {:else}
              <option value={field.key}>{field.label}{field.required ? ' *' : ''}</option>
            {/if}
          {/each}
        </select>
      </div>
    {/each}
  </div>

  <div class="summary-bar">
    <span class="summary-ready">{readyCount} ready</span>
    {#if errorCount > 0}
      <span class="summary-errors">{errorCount} errors</span>
    {/if}
    {#if uncheckedCount > 0}
      <span class="summary-unchecked">{uncheckedCount} unchecked</span>
    {/if}
    <div class="spacer"></div>
    <button class="btn btn-sm btn-secondary" onclick={selectAll}>Select All</button>
    <button class="btn btn-sm btn-secondary" onclick={selectNone}>Select None</button>
  </div>

  <div class="table-wrapper">
    <table class="import-table">
      <thead>
        <tr>
          <th class="col-check"></th>
          <th class="col-row">#</th>
          {#each mappings as mapping (mapping.columnIndex)}
            {#if mapping.fieldKey}
              {@const def = columnDefs.find(d => d.key === mapping.fieldKey)}
              <th>{def?.label ?? mapping.fieldKey}</th>
            {/if}
          {/each}
          <th class="col-status"></th>
        </tr>
      </thead>
      <tbody>
        {#each sortedIndices as rowIdx (rowIdx)}
          {@const validation = rowValidations[rowIdx]}
          {@const checked = checkedRows.has(rowIdx)}
          <tr class:row-error={!validation?.valid} class:row-unchecked={!checked && validation?.valid}>
            <td class="col-check">
              <input type="checkbox" checked={checked} onchange={() => toggleRow(rowIdx)} />
            </td>
            <td class="col-row">{rowIdx + 1}</td>
            {#each mappings as mapping (mapping.columnIndex)}
              {#if mapping.fieldKey}
                {@const cellError = validation?.cellErrors[mapping.fieldKey]}
                {@const cellWarning = validation?.cellWarnings[mapping.fieldKey]}
                <td
                  class="cell"
                  class:cell-error={!!cellError}
                  class:cell-warning={!!cellWarning && !cellError}
                  title={cellError ?? cellWarning ?? ''}
                  ondblclick={() => editingCell = { row: rowIdx, col: mapping.columnIndex }}
                >
                  {#if editingCell?.row === rowIdx && editingCell?.col === mapping.columnIndex}
                    <input
                      class="cell-input"
                      type="text"
                      value={editableRows[rowIdx][mapping.columnIndex] ?? ''}
                      onblur={(e) => commitEdit(rowIdx, mapping.columnIndex, e.currentTarget.value)}
                      onkeydown={(e) => handleKeydown(e, rowIdx, mapping.columnIndex)}
                    />
                  {:else}
                    {editableRows[rowIdx]?.[mapping.columnIndex] ?? ''}
                  {/if}
                </td>
              {/if}
            {/each}
            <td class="col-status">
              {#if validation?.valid}
                <span class="status-ok" title="Valid">&#10003;</span>
              {:else}
                <span class="status-err" title={Object.values(validation?.cellErrors ?? {}).join('; ')}>&#10007;</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<style>
  .mapping-warning {
    background: #fff3cd;
    color: #856404;
    padding: var(--spacing-sm) var(--spacing-md);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-sm);
  }

  .mapping-row {
    display: flex;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-md);
    overflow-x: auto;
    padding-bottom: var(--spacing-xs);
  }

  .mapping-col {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    min-width: 100px;
  }

  .mapping-header {
    font-size: var(--font-size-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 120px;
  }

  .mapping-select {
    font-size: var(--font-size-xs);
    padding: 2px 4px;
  }

  .summary-bar {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) 0;
    font-size: var(--font-size-sm);
    border-bottom: 1px solid var(--color-divider);
    margin-bottom: var(--spacing-sm);
  }

  .summary-ready { color: var(--color-success); font-weight: 600; }
  .summary-errors { color: var(--color-error); font-weight: 600; }
  .summary-unchecked { color: var(--color-text-muted); }

  .table-wrapper {
    max-height: 400px;
    overflow: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .import-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .import-table th {
    position: sticky;
    top: 0;
    background: var(--color-surface-variant);
    padding: var(--spacing-xs) var(--spacing-sm);
    text-align: left;
    font-weight: 600;
    border-bottom: 2px solid var(--color-border);
    white-space: nowrap;
  }

  .import-table td {
    padding: var(--spacing-xs) var(--spacing-sm);
    border-bottom: 1px solid var(--color-divider);
  }

  .col-check { width: 30px; text-align: center; }
  .col-row { width: 35px; color: var(--color-text-muted); }
  .col-status { width: 30px; text-align: center; }

  .cell { cursor: text; }
  .cell-error { background: #fde8e8; border: 1px solid var(--color-error); }
  .cell-warning { background: #fff3cd; border: 1px solid var(--color-warning, #f59e0b); }

  .cell-input {
    width: 100%;
    border: 2px solid var(--color-primary);
    border-radius: var(--radius-sm);
    padding: 1px 4px;
    font-size: var(--font-size-sm);
    outline: none;
  }

  .row-error { opacity: 0.85; }
  .row-unchecked { opacity: 0.5; }

  .status-ok { color: var(--color-success); font-weight: bold; }
  .status-err { color: var(--color-error); font-weight: bold; }
</style>
