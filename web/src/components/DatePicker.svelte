<script lang="ts">
  // A month calendar (weeks start on Monday) with quick picks. Reports a 'YYYY-MM-DD' day, or
  // null for Clear. Escape is handled by whoever hosts it.
  import { untrack } from 'svelte'
  import { addDays, monthGrid, nextMonday } from '../lib/dates'
  import { app } from '../lib/state.svelte'

  let { value, onchange }: { value: string | null; onchange: (day: string | null) => void } = $props()

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const HEADS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

  const start = untrack(() => value ?? app.today)
  let year = $state(Number(start.slice(0, 4)))
  let month = $state(Number(start.slice(5, 7)))

  const weeks = $derived(monthGrid(year, month))

  function shift(by: number) {
    const m = month - 1 + by
    year += Math.floor(m / 12)
    month = (((m % 12) + 12) % 12) + 1
  }
  const inMonth = (day: string) => Number(day.slice(5, 7)) === month
</script>

<div class="picker">
  <div class="nav">
    <button type="button" class="step" aria-label="Previous month" onclick={() => shift(-1)}>‹</button>
    <span class="month" aria-live="polite">{MONTHS[month - 1]} {year}</span>
    <button type="button" class="step" aria-label="Next month" onclick={() => shift(1)}>›</button>
  </div>
  <table role="grid">
    <thead>
      <tr>{#each HEADS as h (h)}<th scope="col">{h}</th>{/each}</tr>
    </thead>
    <tbody>
      {#each weeks as week (week[0])}
        <tr>
          {#each week as day (day)}
            <td role="gridcell">
              <button type="button" class="day" class:other={!inMonth(day)} class:sel={day === value}
                class:now={day === app.today} aria-label={day} aria-pressed={day === value}
                onclick={() => onchange(day)}>{Number(day.slice(8))}</button>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="quick">
    <button type="button" class="pill" onclick={() => onchange(app.today)}>Today</button>
    <button type="button" class="pill" onclick={() => onchange(addDays(app.today, 1))}>Tomorrow</button>
    <button type="button" class="pill" onclick={() => onchange(nextMonday(app.today))}>Next Monday</button>
    <button type="button" class="pill clear" onclick={() => onchange(null)}>Clear</button>
  </div>
</div>

<style>
  .picker {
    margin-top: 6px;
    padding: 8px;
    border: 1px solid #e3e0d9;
    border-radius: 8px;
    background: #fff;
    width: max-content;
    max-width: 100%;
  }
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .step {
    padding: 0 8px;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 1.2em;
    cursor: pointer;
  }
  table {
    border-collapse: collapse;
  }
  th {
    padding: 2px 0;
    color: #999;
    font-size: 0.88em;
    font-weight: 400;
  }
  td {
    padding: 1px;
    text-align: center;
  }
  .day {
    width: 28px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .day:hover {
    background: #f1efea;
  }
  .other {
    color: #bbb;
  }
  .now {
    border-color: #cfcac0;
  }
  .sel {
    background: var(--text);
    border-color: var(--text);
    color: #fff;
  }
  .sel:hover {
    background: var(--text);
  }
  .quick {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid #eee;
  }
  .pill {
    padding: 1px 9px;
    border: 1px solid #e3e0d9;
    border-radius: 12px;
    background: #fbfaf8;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .clear {
    margin-left: auto;
    color: #999;
  }
</style>
