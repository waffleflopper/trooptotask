export function hasPdfFileSignature(bytes: Uint8Array): boolean {
	return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}
