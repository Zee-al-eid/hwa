<script>
  import { start_hydrating } from "svelte/internal";

  import Procedure from "./Procedure.svelte";
  import Timer from "./Timer.svelte";

  let startAudio;
  let endAudio;

  function timerEnds() {
    endAudio.play();
  }

  function timerStarts() {
    startAudio.play();
  }
</script>

<main>
  <h1>Hand Washing App</h1>
  <Timer on:start={timerStarts} on:end={timerEnds} />
  <Procedure />
  <div bp="flex">
    <h2 bp="padding-right--lg">
      <a href="https://www.unwater.org" target="_blank">Image Source </a>
    </h2>
    <h2><a href="https://pixabay.com/" target="_blank">Sound Source </a></h2>
  </div>
</main>

<audio bind:this={endAudio}><source src="end.mp3" /></audio>
<audio bind:this={startAudio}><source src="start.mp3" /></audio>

<style>
  main {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  h1 {
    text-transform: uppercase;
    color: rgb(37, 120, 180);
  }
</style>
