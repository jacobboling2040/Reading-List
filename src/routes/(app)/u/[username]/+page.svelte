<script lang="ts">
	import { untrack } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import { pending } from '../../../../lib/pending';
	import { fade } from 'svelte/transition';
	import { SHELF_LABELS } from '../../../../lib/format';
	import BookCard from '../../../../lib/components/BookCard.svelte';
	import ShelfTabs from '../../../../lib/components/ShelfTabs.svelte';
	import Stars from '../../../../lib/components/Stars.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const p = $derived(data.profile);
	let tab = $state(untrack(() => data.tab));
	// Re-sync on real navigations only. A form action re-runs load with the original URL
	// (and reports type 'form'), which must not undo a client-side tab switch.
	afterNavigate(({ type }) => {
		if (type !== 'form') tab = data.tab;
	});
	const fadeMs = () =>
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
			? 0
			: 120;
</script>

<svelte:head><title>{p.displayName}</title></svelte:head>

<main class="page">
	<header class="head">
		<div>
			<h1>{p.displayName}</h1>
			<p class="muted">@{p.username}</p>
		</div>
		{#if data.isSelf}
			<a class="button button-quiet" href="/settings">Edit your settings</a>
		{:else}
			<form method="POST" action={data.following ? '?/unfollow' : '?/follow'} use:pending>
				<button class={data.following ? 'button-quiet' : ''}>
					{data.following ? 'Unfollow' : 'Follow'}
				</button>
			</form>
		{/if}
	</header>
	{#if form?.message}<p class="callout error" role="alert">{form.message}</p>{/if}

	<ShelfTabs
		counts={p.counts}
		active={tab}
		href={(s) => `?tab=${s}`}
		onselect={(s) => (tab = s)}
		label="Shelves"
	/>

	{#if tab}
		{#key tab}
			<section in:fade={{ duration: fadeMs() }}>
				<h2>{SHELF_LABELS[tab]}</h2>
				{#if data.shelves[tab].length === 0}
					<p class="muted">Nothing here yet.</p>
				{:else}
					<ul class="list">
						{#each data.shelves[tab] as book (book.id)}
							<li><BookCard {book} size="sm" /></li>
						{/each}
					</ul>
				{/if}
				<p><a href="/u/{p.username}">Back to profile</a></p>
			</section>
		{/key}
	{:else}
		<section>
			<h2>Reading now</h2>
			{#if p.readingNow.length === 0}
				<p class="muted">Not reading anything right now.</p>
			{:else}
				<ul class="list">
					{#each p.readingNow as book (book.id)}
						<li><BookCard {book} size="sm" /></li>
					{/each}
				</ul>
			{/if}
		</section>

	<section>
		<h2>Recent reviews</h2>
		{#if p.recentReviews.length === 0}
			<p class="muted">No reviews yet.</p>
		{:else}
			<ul class="list">
				{#each p.recentReviews as r (r.book.id)}
					<li>
						<BookCard book={r.book} size="sm">
							<Stars rating={r.rating} />
							{#if r.body}<p class="body">{r.body}</p>{/if}
						</BookCard>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
	{/if}
</main>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.head form {
		margin: 0;
	}
	section {
		margin-bottom: var(--space-5);
	}
	.body {
		white-space: pre-line;
		margin: var(--space-2) 0 0;
	}
</style>
