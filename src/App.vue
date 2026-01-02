<script setup lang="ts">
import { computed } from 'vue'

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
</script>

<template>
  <main
    class="min-h-[100svh] bg-black text-white flex items-center justify-center p-4 select-none"
  >
    <!-- Story canvas: keep a stable 9:16 frame, centered, with safe padding -->
    <section
      class="w-full max-w-[440px] aspect-[9/16] bg-black flex flex-col px-5"
      :style="{
        paddingTop: 'calc(1.5rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))',
      }"
      aria-label="Year progress"
    >
      <header class="flex items-baseline justify-between">
        <h1 class="text-base font-medium tracking-wide">Year progress</h1>
        <div class="text-sm tabular-nums text-white/80">
          {{ filledCount }} / {{ totalDays }}
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

      <footer class="pt-4 text-xs text-white/60">
        {{ year }} • Local time
      </footer>
    </section>
  </main>
</template>


