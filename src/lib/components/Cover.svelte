<script lang="ts">
	import { coverUrl } from '../cover';

	let {
		title,
		coverId,
		size = 'md'
	}: { title: string; coverId: number | null; size?: 'sm' | 'md' | 'lg' } = $props();

	let failed = $state(false);
	let img: HTMLImageElement | undefined = $state();
	const src = $derived(coverUrl(coverId, size === 'lg' ? 'L' : 'M'));

	// A server-rendered image can fail before hydration attaches onerror; catch that case too.
	$effect(() => {
		if (img?.complete && img.naturalWidth === 0) failed = true;
	});
</script>

<div class="cover {size}">
	{#if src && !failed}
		<img
			bind:this={img}
			{src}
			alt={title}
			loading="lazy"
			decoding="async"
			onerror={() => (failed = true)}
		/>
	{:else}
		<div class="placeholder" role="img" aria-label={title}>
			<span aria-hidden="true">{title}</span>
		</div>
	{/if}
</div>

<style>
	.cover {
		flex: none;
		aspect-ratio: 2 / 3;
		border-radius: var(--radius-s) var(--radius-m) var(--radius-m) var(--radius-s);
		overflow: hidden;
		background: var(--color-surface-sunk);
		box-shadow:
			inset 3px 0 0 rgb(0 0 0 / 12%),
			0 1px 3px rgb(40 25 10 / 25%);
	}
	.sm {
		width: 3.25rem;
	}
	.md {
		width: 5rem;
	}
	.lg {
		width: 8.5rem;
	}
	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.placeholder {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-2) var(--space-1) var(--space-2) var(--space-2);
		background:
			linear-gradient(90deg, rgb(0 0 0 / 10%) 0 3px, transparent 3px),
			var(--color-accent-soft);
		color: var(--color-ink-soft);
		font-family: var(--font-serif);
		text-align: center;
		line-height: 1.15;
		overflow: hidden;
	}
	.placeholder span {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 5;
		line-clamp: 5;
		overflow: hidden;
	}
	.sm .placeholder {
		font-size: 0.55rem;
	}
	.md .placeholder {
		font-size: 0.75rem;
	}
	.lg .placeholder {
		font-size: 1rem;
	}
</style>
