const { contextBridge, ipcRenderer } = require("electron");

// Exposes a secure API to the renderer process.

contextBridge.exposeInMainWorld("electronAPI", {
  // `ipcRenderer.invoke` is a secure, two-way communication method.
  readCsvFile: () => ipcRenderer.invoke("dialog:readCsvFile"),

  // Exposes a function to the web page that sends the updated visitor data to the
  // main process to be saved back to the CSV file.
  updateAndSaveCsvFile: (updatedVisitor) =>
    ipcRenderer.invoke("dialog:updateAndSaveCsvFile", updatedVisitor),
});
