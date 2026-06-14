type ExcelWorkbookConstructor<T> = new () => T;

export function resolveExcelWorkbookConstructor<T>(module: unknown): ExcelWorkbookConstructor<T> {
	const candidate = module as {
		Workbook?: ExcelWorkbookConstructor<T>;
	};
	const WorkbookCtor = candidate.Workbook;
	if (!WorkbookCtor) {
		throw new Error('ExcelJS Workbook constructor is unavailable');
	}
	return WorkbookCtor;
}
