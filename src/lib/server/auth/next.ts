const BASE = 'http://internal.invalid';

/** A post-login redirect target is allowed only if it resolves to a same-origin path. */
export function safeNext(next: string | null | undefined): string {
	// Browsers strip tab/CR/LF inside URLs, so control characters can smuggle in `//host`.
	if (!next || !next.startsWith('/') || /[\x00-\x1f\x7f]/.test(next)) return '/';
	try {
		const url = new URL(next, BASE);
		if (url.origin !== BASE) return '/';
		// Dot segments can normalize to `//host` (e.g. `/.//evil.example`), which is protocol-relative.
		if (url.pathname.startsWith('//') || url.pathname.startsWith('/\\')) return '/';
		return url.pathname + url.search + url.hash;
	} catch {
		return '/';
	}
}
