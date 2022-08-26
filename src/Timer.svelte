<script>
  import Progress from "./Progress.svelte";
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();
  let progress;
  let isRunning = false;
  const totalseconds = 20;
  let secondsLeft = totalseconds;

  const startTimer = () => {
    dispatch("start");
    const timer = setInterval(() => {
      secondsLeft -= 1;
      isRunning = true;
      progress = ((totalseconds - secondsLeft) / totalseconds) * 100;
      if (secondsLeft == 0) {
        clearInterval(timer);
        secondsLeft = totalseconds;
        isRunning = false;
        progress = 0;
        dispatch("end");
      }
    }, 1000);
  };
</script>

<div>
  <h2>Seconds Left:</h2>
  <h2 class="sec">{secondsLeft}</h2>
</div>
<Progress {progress} />
<button
  disabled={isRunning}
  on:click={startTimer}
  class="start"
  bp="full-width-until@md">Start</button
>

<style>
  div {
    display: flex;
    flex-direction: row;
  }
  h2 {
    margin: 0 5px 15px 5px;
  }
  button {
    background-color: rgb(37, 120, 180);
    color: white;
    height: 50px;
    cursor: pointer;
    border: none;
    border-radius: 5px;
    width: 33%;
    margin: 20px auto;
    font-size: larger;
    text-transform: capitalize;
  }
  button:hover {
    background-color: white;
    border: solid 2px rgb(37, 120, 180);
    color: rgb(37, 120, 180);
  }

  button:disabled {
    background-color: rgb(156, 156, 156);
    cursor: not-allowed;
  }
  button:disabled:hover {
    background-color: rgb(143, 142, 142);
    color: lightgray;
    cursor: not-allowed;
    border: none;
  }
</style>
