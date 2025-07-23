self.onmessage = function(e) {
  const { chunkFiles } = e.data;
  let allData = [];
  let loadedChunks = 0;
  const totalChunks = chunkFiles.length;

  function processChunks(index) {
    if (index >= totalChunks) {
      self.postMessage({ type: 'complete', data: allData });
      return;
    }

    fetch(`assets/${chunkFiles[index]}`)
      .then(res => res.json())
      .then(chunkData => {
        allData = allData.concat(chunkData);
        loadedChunks++;
        const progress = Math.round((loadedChunks / totalChunks) * 100);
        self.postMessage({ type: 'progress', data: { progress, chunkData } });
        processChunks(index + 1);
      });
  }

  processChunks(0);
};
