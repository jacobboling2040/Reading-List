<script lang="ts">
	import { replaceState } from '$app/navigation';
	import { SHELF_LABELS } from '../format';
	import type { ShelfStatus } from '../server/shelves';

	type Props = {
		counts: Record<ShelfStatus, number>;
		active: ShelfStatus | null;
		href: (s: ShelfStatus) => string;
		onselect: (s: ShelfStatus) => void;
		label: string;
	};
	let { counts, active, href, onselect, label }: Props = $props();

	const statuses = ['to_read', 'reading', 'finished'] as const;
	const index = $derived(active ? statuses.indexOf(active) : -1);

	// Plain clicks switch on the client; modified clicks and no-JS keep the link.
	function click(e: MouseEvent, s: ShelfStatus) {
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		onselect(s);
		replaceState(href(s), {});
	}
</script>

<nav class="tabs" aria-label={label}>
	{#each statuses as s (s)}
		<a href={href(s)} aria-current={active === s ? 'page' : undefined} onclick={(e) => click(e, s)}>
			{SHELF_LABELS[s]} <span class="count">{counts[s]}</span>
		</a>
	{/each}
	<span
		class="underline"
		aria-hidden="true"
		style:transform="translateX({Math.max(index, 0) * 100}%)"
		style:opacity={index < 0 ? 0 : 1}
	></span>
</nav>

<style>
	.tabs {
		position: relative;
		display: flex;
		border-bottom: 1px solid var(--color-line);
		margin-bottom: var(--space-5);
	}
	.tabs a {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: var(--tap);
		padding: 0 var(--space-1);
		white-space: nowrap;
		color: var(--color-ink-soft);
		text-decoration: none;
		font-weight: 600;
	}
	.tabs a[aria-current='page'] {
		color: var(--color-ink);
	}
	.underline {
		position: absolute;
		left: 0;
		bottom: -1px;
		width: calc(100% / 3);
		height: 3px;
		background: var(--color-accent);
		transition:
			transform var(--dur, 180ms) var(--ease, cubic-bezier(0.2, 0, 0, 1)),
			opacity var(--dur, 180ms) var(--ease, cubic-bezier(0.2, 0, 0, 1));
	}
	.count {
		font-size: 0.8rem;
		font-weight: 500;
		min-width: 1.5rem;
		padding: 0 var(--space-1);
		border-radius: 999px;
		background: var(--color-surface-sunk);
		text-align: center;
	}
	@media (prefers-reduced-motion: reduce) {
		.underline {
			transition: none;
		}
	}
</style>
