<script lang="ts">
	import type { Snippet } from 'svelte';
	import Cover from './Cover.svelte';

	type CardBook = {
		id: number;
		title: string;
		authors: string[];
		coverId: number | null;
		year: number | null;
	};

	let {
		book,
		size = 'md',
		children
	}: { book: CardBook; size?: 'sm' | 'md'; children?: Snippet } = $props();
</script>

<article class="book-card card {size}">
	<a class="cover-link" href="/books/{book.id}" tabindex="-1" aria-hidden="true">
		<Cover title={book.title} coverId={book.coverId} {size} />
	</a>
	<div class="head">
		<h3><a href="/books/{book.id}">{book.title}</a></h3>
		<p class="byline">
			{book.authors.join(', ') || 'Unknown author'}
			{#if book.year}<span class="year">· {book.year}</span>{/if}
		</p>
	</div>
	{#if children}<div class="extra">{@render children()}</div>{/if}
</article>

<style>
	/* Narrow: cover beside the title, extras full width below. Wider: extras under the title. */
	.book-card {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--space-3) var(--space-4);
		align-items: start;
	}
	.book-card.sm {
		padding: var(--space-3);
		gap: var(--space-3);
	}
	.cover-link {
		display: block;
		text-decoration: none;
	}
	.extra {
		grid-column: 1 / -1;
		min-width: 0;
	}
	@media (min-width: 30rem) {
		.cover-link {
			grid-row: span 2;
		}
		.extra {
			grid-column: 2;
		}
	}
	h3 {
		margin-bottom: var(--space-1);
	}
	h3 a {
		color: inherit;
		text-decoration: none;
	}
	h3 a:hover {
		text-decoration: underline;
	}
	.byline {
		color: var(--color-ink-soft);
		margin: 0;
	}
	.sm .byline {
		font-size: 0.95rem;
	}
</style>
