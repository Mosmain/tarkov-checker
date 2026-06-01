<script setup lang="ts">
// Animated dashed boundary for the unlocked overlay. An SVG stroke (not a CSS
// border) so the marching-ants dashes follow the rounded corners cleanly.
// Teleported to <body> so it sits outside #app, which the opacity slider dims.
</script>

<template>
  <Teleport to="body">
    <svg class="overlay-border" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      <!-- pathLength normalizes the perimeter to 100 units so the dash pattern
           divides evenly and closes without a seam at any window size. -->
      <rect pathLength="100" />
    </svg>
  </Teleport>
</template>
