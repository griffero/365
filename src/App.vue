<script setup lang="ts">
import { computed } from 'vue'
import { exportStoryPng } from './utils/exportStoryPng'

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInYear(year: number) {
  return isLeapYear(year) ? 366 : 365
}

function dayOfYear(date: Date) {
  // Use local-midnight to avoid DST/timezone edge cases.
  const start = new Date(date.getFullYear(), 0, 1)
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.floor((current.getTime() - start.getTime()) / msPerDay) + 1
}

const today = new Date()
const year = today.getFullYear()

const totalDays = computed(() => daysInYear(year))
const filledCount = computed(() => Math.min(dayOfYear(today), totalDays.value))
const dots = computed(() => Array.from({ length: totalDays.value }, (_, i) => i))

const yearPercent = computed(() => ((filledCount.value / totalDays.value) * 100).toFixed(1))

async function onDownload() {
  await exportStoryPng({
    totalDays: totalDays.value,
    filledCount: filledCount.value,
    year,
    yearPercent: yearPercent.value,
    title: 'Year progress',
  })
}
</script>

<template>
  <main
    class="min-h-[100svh] bg-black text-white flex items-center justify-center px-2 py-3 sm:p-4 select-none"
  >
    <!-- Story canvas: keep a stable 9:16 frame, centered, with safe padding -->
    <section
      class="w-full max-w-[440px] aspect-[9/16] bg-black flex flex-col px-5"
      :style="{
        // Match a generous Stories safe-area by default.
        paddingTop: 'calc(2.5rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(3.0rem + env(safe-area-inset-bottom))',
      }"
      aria-label="Year progress"
    >
      <header class="flex items-baseline justify-between gap-3">
        <h1 class="text-base font-medium tracking-wide">Year progress</h1>
        <div class="flex flex-col items-end">
          <div class="text-sm tabular-nums text-white/80">{{ filledCount }} / {{ totalDays }}</div>
          <div class="mt-1 text-xs tabular-nums text-white/70">{{ yearPercent }}%</div>
        </div>
      </header>

      <div class="mt-4 flex-1 flex items-center">
        <div
          class="w-full grid grid-cols-[repeat(19,minmax(0,1fr))] gap-[4px]"
          role="img"
          :aria-label="`A grid of ${totalDays} days. ${filledCount} filled so far.`"
        >
          <div
            v-for="i in dots"
            :key="i"
            class="aspect-square rounded-full border border-white"
            :class="i < filledCount ? 'bg-white' : 'bg-transparent'"
          />
        </div>
      </div>

      <footer class="pt-4 flex items-center justify-between text-xs text-white/60">
        <div>{{ year }} • Local time</div>
        <button
          type="button"
          class="rounded-full border border-white/20 bg-white/5 p-2 text-white/80 hover:bg-white/10 hover:text-white/90 active:bg-white/15"
          aria-label="Share or download story image"
          title="Save / Share"
          @click="onDownload"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </button>
      </footer>
    </section>
  </main>
</template>


