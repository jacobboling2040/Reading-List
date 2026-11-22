<script lang="ts">
	let { rating }: { rating: number } = $props();

	const label = $derived(`${rating} ${rating === 1 ? 'star' : 'stars'}`);
</script>

<span class="stars" role="img" aria-label={label}>
	{#each [1, 2, 3, 4, 5] as i (i)}<span class:on={i <= rating} aria-hidden="true">★</span>{/each}
</span>

<style>
	.stars {
		display: inline-flex;
		letter-spacing: 0.05em;
		color: var(--color-star-empty);
		white-space: nowrap;
	}
	.on {
		color: var(--color-star);
	}
</style>
