export const SUPABASE_PAGE_SIZE = 1000;

export interface SupabasePageResult<T> {
	data: T[] | null;
	error: unknown;
	count?: number | null;
}

export async function selectAllSupabaseRows<T>(
	fetchPage: (from: number, to: number) => Promise<SupabasePageResult<T>>
): Promise<SupabasePageResult<T>> {
	const rows: T[] = [];
	let count: number | null = null;
	let from = 0;

	while (true) {
		const result = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
		if (result.error) {
			return {
				data: null,
				error: result.error,
				count: result.count ?? count
			};
		}

		if (result.count != null && count == null) {
			count = result.count;
		}

		const pageRows = result.data ?? [];
		rows.push(...pageRows);

		if (pageRows.length < SUPABASE_PAGE_SIZE) {
			break;
		}

		from += SUPABASE_PAGE_SIZE;
	}

	return {
		data: rows,
		error: null,
		count
	};
}
