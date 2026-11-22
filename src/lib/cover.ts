/** Open Library cover image URL (client-safe; re-exported by server/books.ts). */
export function coverUrl(coverId: number | null, size: 'S' | 'M' | 'L'): string | null {
	return coverId == null ? null : `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg`;
}
