<script lang="ts">
	import { enhance } from '$app/forms';
	import Cover from '../../../../lib/components/Cover.svelte';
	import Stars from '../../../../lib/components/Stars.svelte';
	import { formatDate, SHELF_LABELS } from '../../../../lib/format';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const statuses = ['to_read', 'reading', 'finished'] as const;
	// When prompting after "Finished", focus lands on the current rating (or the first star).
	const focusRating = $derived(data.mine?.rating ?? 1);
</script>

<svelte:head><title>{data.book.title}</title></svelte:head>

<main class="page">
	<header class="book">
		<Cover title={data.book.title} coverId={data.book.coverId} size="lg" />
		<div>
			<h1>{data.book.title}</h1>
			<p class="byline">{data.book.authors.join(', ') || 'Unknown author'}</p>
			{#if data.book.year}<p class="muted year">First published {data.book.year}</p>{/if}
			<p class="summary">
				{#if data.average !== null}
					<span aria-hidden="true"><Stars rating={Math.round(data.average)} /></span>
					<strong>{data.average.toFixed(1)}</strong>
					<span class="muted">
						from {data.reviewerCount}
						{data.reviewerCount === 1 ? 'reviewer' : 'reviewers'}
					</span>
				{:else}
					<span class="muted">No reviews yet.</span>
				{/if}
			</p>
		</div>
	</header>

	{#if form?.message}<p class="callout error" role="alert">{form.message}</p>{/if}

	<section class="shelf" aria-labelledby="shelf-heading">
		<h2 id="shelf-heading" class="label">Your shelf</h2>
		<div class="actions">
			<form class="segmented" method="POST" action="?/shelf" use:enhance>
				{#each statuses as s (s)}
					<button
						name="status"
						value={s}
						class:button-quiet={data.status !== s}
						aria-pressed={data.status === s}>{SHELF_LABELS[s]}</button
					>
				{/each}
			</form>
			{#if data.status}
				<form method="POST" action="?/remove" use:enhance>
					<button class="link-button">Remove from shelves</button>
				</form>
			{/if}
		</div>
	</section>

	<section class="card review-form" id="review">
		<form
			class="stack"
			method="POST"
			action="?/review"
			aria-labelledby="review-heading"
			use:enhance
		>
			<h2 id="review-heading">Your review</h2>
			{#if data.reviewPrompt}
				<p class="callout prompt">
					Finished! How was it? <a href="/books/{data.book.id}">Skip</a>
				</p>
			{/if}
			<fieldset>
				<legend>Your rating</legend>
				<div class="rating">
					{#each [1, 2, 3, 4, 5] as i (i)}
						<label>
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="radio"
								name="rating"
								value={i}
								required
								checked={data.mine?.rating === i}
								autofocus={data.reviewPrompt && i === focusRating}
							/>
							<span aria-hidden="true">★</span>
							<span class="visually-hidden">{i} {i === 1 ? 'star' : 'stars'}</span>
						</label>
					{/each}
				</div>
			</fieldset>
			<label>
				Your review (optional)
				<textarea name="body" maxlength="5000" value={data.mine?.body ?? ''}></textarea>
			</label>
			<div class="actions">
				<button>Save review</button>
			</div>
		</form>
		{#if data.mine}
			<form class="delete" method="POST" action="?/deleteReview" use:enhance>
				<button class="link-button">Delete review</button>
			</form>
		{/if}
	</section>

	<section aria-labelledby="reviews-heading">
		<h2 id="reviews-heading">Reviews</h2>
		{#if data.reviews.length === 0}
			<p class="muted">Be the first to say what you thought.</p>
		{:else}
			<ul class="list reviews">
				{#each data.reviews as r (r.username)}
					<li class="review">
						<p class="who">
							<a href="/u/{r.username}">{r.displayName}</a>
							<Stars rating={r.rating} />
							<span class="muted date">{formatDate(r.updatedAt)}</span>
						</p>
						{#if r.body}<p class="text">{r.body}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.toRead.length}
		<p class="to-read">
			<span class="label">On to-read:</span>
			{#each data.toRead as m, i (m.username)}{#if i > 0},
				{/if}<a href="/u/{m.username}">{m.displayName}</a>{/each}
		</p>
	{/if}
</main>

<style>
	.book {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4) var(--space-5);
		align-items: flex-end;
		margin-bottom: var(--space-5);
	}
	.book > div {
		flex: 1 1 14rem;
		min-width: 0;
	}
	.book h1 {
		margin-bottom: var(--space-2);
	}
	.byline {
		font-size: 1.1rem;
		margin-bottom: var(--space-1);
	}
	.year {
		font-size: 0.95rem;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-2);
		margin: 0;
	}
	.label {
		font-family: var(--font-sans);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-soft);
	}
	.shelf {
		margin-bottom: var(--space-5);
	}
	.shelf h2 {
		margin-bottom: var(--space-2);
	}
	.segmented {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
	}
	.review-form {
		margin-bottom: var(--space-6);
		scroll-margin-top: var(--space-4);
	}
	.review-form h2 {
		margin: 0;
	}
	.prompt {
		margin: 0;
	}
	.prompt a {
		font-weight: 600;
		margin-left: var(--space-2);
	}
	.rating {
		display: flex;
	}
	.rating label {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: var(--tap);
		height: var(--tap);
		font-size: 1.9rem;
		line-height: 1;
		color: var(--color-star-empty);
		cursor: pointer;
		border-radius: var(--radius-m);
	}
	.rating input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		cursor: pointer;
	}
	.rating label:has(input:focus-visible) {
		outline: 3px solid var(--color-focus);
		outline-offset: -2px;
	}
	/* Fill every star up to the checked one. */
	.rating:has(input[value='1']:checked) label:nth-child(-n + 1),
	.rating:has(input[value='2']:checked) label:nth-child(-n + 2),
	.rating:has(input[value='3']:checked) label:nth-child(-n + 3),
	.rating:has(input[value='4']:checked) label:nth-child(-n + 4),
	.rating:has(input[value='5']:checked) label:nth-child(-n + 5) {
		color: var(--color-star);
	}
	/* Preview on hover: stars up to the hovered one. */
	@media (hover: hover) {
		.rating:hover label {
			color: var(--color-star);
		}
		.rating label:hover ~ label {
			color: var(--color-star-empty);
		}
	}
	.delete {
		margin-top: var(--space-2);
	}
	.delete button {
		padding-left: 0;
	}
	.reviews {
		gap: 0;
	}
	.review {
		padding: var(--space-3) 0;
		border-top: 1px solid var(--color-line);
	}
	.review:first-child {
		border-top: 0;
		padding-top: 0;
	}
	.who {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		margin-bottom: var(--space-1);
	}
	.who a {
		color: inherit;
		font-weight: 600;
	}
	.date {
		font-size: 0.85rem;
	}
	.text {
		font-family: var(--font-serif);
		font-size: 1.05rem;
		white-space: pre-line;
		margin: 0;
	}
	.to-read {
		margin-top: var(--space-5);
		padding-top: var(--space-4);
		border-top: 1px solid var(--color-line);
	}
	.to-read .label {
		margin-right: var(--space-1);
	}
</style>
