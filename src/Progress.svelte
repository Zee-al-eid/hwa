<script>
  export let progress = 0;
</script>

<div class="container" bp="full-width-until@md">
  <div class="bar">
    <div style="width:{progress}%" class="fill" />
  </div>
</div>

<style>
  .container {
    width: 33%;
    margin: 0 auto;
  }
  .bar {
    border: solid gray 2px;
    height: 50px;
    border-radius: 5px;
  }
  .fill {
    height: 46px;
    border-radius: 5px;
    background-color: #7ceb87;
  }
</style>
