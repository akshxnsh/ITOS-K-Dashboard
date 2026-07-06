importScripts("vendor/xlsx.full.min.js", "excel-processor.js");

var loadedIndex = null;

self.onmessage = function handleWorkerMessage(event) {
  var message = event.data || {};

  if (message.type === "parse") {
    loadedIndex = null;

    try {
      var result = self.AssetExcelProcessor.processWorkbook(
        message.arrayBuffer,
        message.fileName,
        function reportProgress(progress) {
          self.postMessage({
            type: "progress",
            progress: progress
          });
        }
      );

      loadedIndex = result.index;
      self.postMessage({
        type: "ready",
        summary: result.summary
      });
    } catch (error) {
      self.postMessage({
        type: "error",
        message: error && error.message ? error.message : "Import failed."
      });
    }
  } else if (message.type === "search") {
    try {
      self.postMessage({
        type: "searchResult",
        requestId: message.requestId,
        result: self.AssetExcelProcessor.searchAsset(loadedIndex, message.assetCode)
      });
    } catch (error) {
      self.postMessage({
        type: "searchError",
        requestId: message.requestId,
        message: error && error.message ? error.message : "Search failed."
      });
    }
  }
};
