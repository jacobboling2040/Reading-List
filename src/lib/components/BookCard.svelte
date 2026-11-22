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
	<div class="body">
		<h3><a href="/books/{book.id}">{book.title}</a></h3>
		<p class="byline">
			{book.authors.join(', ') || 'Unknown author'}
			{#if book.year}<span class="year">· {book.year}</span>{/if}
		</p>
		{@render children?.()}
	</div>
</article>

<style>
	.book-card {
		display: flex;
		gap: var(--space-4);
		align-items: flex-start;
	}
	.book-card.sm {
		padding: var(--space-3);
		gap: var(--space-3);
	}
	.cover-link {
		display: block;
		text-decoration: none;
	}
	.body {
		flex: 1;
		min-width: 0;
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
		margin-bottom: var(--space-2);
	}
	.sm .byline {
		margin-bottom: var(--space-1);
		font-size: 0.95rem;
	}
</style>
