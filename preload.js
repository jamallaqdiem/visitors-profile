// --- Imports ---
// `contextBridge` is a secure way to expose Node.js APIs to the renderer process (the web page)
// without giving it full access.
// `ipcRenderer` provides the renderer process with a way to communicate with the main process.
const { contextBridge, ipcRenderer } = require('electron');

// --- API Exposure ---
/**
 * Exposes a secure API to the renderer process.
 * The `contextBridge` creates a safe, isolated context where you can define
 * a limited set of functions that your web page can call. This prevents
 * malicious code from accessing your main process's full capabilities.
 */
contextBridge.exposeInMainWorld('electronAPI', {
    // Exposes a function to the web page that, when called, will send an
    // asynchronous message to the main process to open a file dialog and read a CSV.
    // `ipcRenderer.invoke` is a secure, two-way communication method.
    readCsvFile: () => ipcRenderer.invoke('dialog:readCsvFile'),

    // Exposes a function to the web page that sends the updated visitor data to the
    // main process to be saved back to the CSV file. The `updatedVisitor` argument
    // is passed securely.
    updateAndSaveCsvFile: (updatedVisitor) => ipcRenderer.invoke('dialog:updateAndSaveCsvFile', updatedVisitor)
});
