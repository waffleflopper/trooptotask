export function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);

	try {
		anchor.click();
	} finally {
		document.body.removeChild(anchor);
		URL.revokeObjectURL(url);
	}
}
