export interface TextSegment {
	text: string;
	bold: boolean;
}

/** Splits `**control**` markup into plain and bold runs. An unpaired `**` stays as plain text. */
export function markupSegments(markup: string): TextSegment[] {
	const parts = markup.split('**');
	if (parts.length % 2 === 0) return [{ text: markup, bold: false }];
	return parts.map((text, index) => ({ text, bold: index % 2 === 1 })).filter((segment) => segment.text);
}

/** Bold runs for every place a query word occurs in `text`, ignoring case. */
export function highlightSegments(text: string, query: string): TextSegment[] {
	const words = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];
	if (!words.length) return [{ text, bold: false }];
	const pattern = new RegExp(
		`(${words
			.sort((a, b) => b.length - a.length)
			.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
			.join('|')})`,
		'gi'
	);
	return text
		.split(pattern)
		.map((part, index) => ({ text: part, bold: index % 2 === 1 }))
		.filter((segment) => segment.text);
}
