// --- Imports ---
// Electron modules for creating the app window, handling IPC, and file dialogs.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
// Built-in Node.js modules for working with file and directory paths.
const path = require('node:path');
// Built-in Node.js module for file system operations.
const fs = require('fs');

// --- Global State Variable ---
// Stores the path of the last opened CSV file. This is crucial for saving back
// to the same file without asking the user to select it again.
let lastUsedFilePath = null;

// --- Window Creation ---
/**
 * Creates the main Electron browser window.
 * It sets up the window's dimensions and its web preferences, including the preload script.
 */
function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            // Path to the preload script, which bridges the gap between the main
            // process and the renderer process (the web page).
            preload: path.join(__dirname, 'preload.js'),
            // `nodeIntegration: false` and `contextIsolation: true` are essential
            // security best practices to prevent the web page from accessing
            // Node.js APIs directly.
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Loads the main HTML file into the window.
    win.loadFile('index.html');
}

// --- CSV Parsing and Stringify Helper Functions ---
/**
 * A more robust function to parse CSV text, handling commas inside quoted fields.
 * It also maps the 'visitorId' header to the 'id' property in the object.
 *
 * @param {string} csvText - The raw CSV data as a string.
 * @returns {Object[]} An array of visitor objects.
 */
const parseCsv = (csvText) => {
    // Splits the text into lines, removing any empty lines.
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) return [];

    // Trims headers to remove whitespace.
    const headers = lines[0].split(',').map(header => header.trim());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values = [];
        let inQuote = false;
        let start = 0;

        // Iterates through the line to correctly handle quoted values.
        for (let j = 0; j < line.length; j++) {
            // Toggles the `inQuote` flag when a double quote is found,
            // as long as it's not an escaped quote (`\"`).
            if (line[j] === '"' && (j === 0 || line[j - 1] !== '\\')) {
                inQuote = !inQuote;
            } else if (line[j] === ',' && !inQuote) {
                // If a comma is found outside of quotes, it's a delimiter.
                let value = line.substring(start, j).trim();
                // Removes surrounding quotes and unescapes internal double quotes.
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.substring(1, value.length - 1).replace(/""/g, '"');
                }
                values.push(value);
                start = j + 1;
            }
        }
        // Handles the last value in the line.
        let lastValue = line.substring(start).trim();
        if (lastValue.startsWith('"') && lastValue.endsWith('"')) {
            lastValue = lastValue.substring(1, lastValue.length - 1).replace(/""/g, '"');
        }
        values.push(lastValue);

        const row = {};
        let hasId = false;
        headers.forEach((header, index) => {
            // Replaces 'visitorId' with 'id' for consistency.
            const key = header === 'visitorId' ? 'id' : header;
            row[key] = values[index] ? values[index].trim() : '';
            if (key === 'id' && row[key]) {
                hasId = true;
            }
        });

        // Only pushes rows that have a valid ID.
        if (hasId) {
            data.push(row);
        }
    }
    return data;
};

/**
 * Converts a given array of visitor objects back into a CSV formatted string.
 *
 * @param {Object[]} visitors - An array of visitor objects.
 * @returns {string} The CSV data as a string.
 */
const stringifyCsv = (visitors) => {
    if (visitors.length === 0) return '';
    
    // Gets the headers from the first object.
    const headers = Object.keys(visitors[0]);
    const headerRow = headers.join(',');

    const rows = visitors.map(visitor => {
        return headers.map(header => {
            const value = visitor[header];
            // Checks if a value needs to be wrapped in quotes.
            const needsQuotes = typeof value === 'string' && (value.includes(',') || value.includes('"'));
            let formattedValue = (value === null || value === undefined) ? '' : value.toString();
            
            if (needsQuotes) {
                // Escapes any double quotes within the value.
                formattedValue = `"${formattedValue.replace(/"/g, '""')}"`;
            }
            return formattedValue;
        }).join(',');
    });

    // Joins header and data rows with a newline.
    return [headerRow, ...rows].join('\n');
};

// --- IPC Communication Handlers ---
// Handles the request from the renderer process to open a file dialog and read a CSV file.
ipcMain.handle('dialog:readCsvFile', async () => {
    try {
        const { canceled, filePaths } = await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'CSV Files', extensions: ['csv'] }]
        });

        if (canceled || filePaths.length === 0) {
            return null; // Returns null if the user cancels.
        } else {
            const filePath = filePaths[0];
            lastUsedFilePath = filePath; // Stores the path for future saves.
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return fileContent;
        }
    } catch (error) {
        console.error("Error reading file:", error);
        return null;
    }
});


// Handles the request to update and save the CSV file with the updated visitor data.
ipcMain.handle('dialog:updateAndSaveCsvFile', async (event, updatedVisitor) => {
    if (!lastUsedFilePath) {
        return { success: false, error: 'No file has been selected for saving yet.' };
    }

    try {
        // Reads the existing file content.
        const fileContent = fs.readFileSync(lastUsedFilePath, 'utf-8');
        // Parses the content into an array of visitor objects.
        const visitors = parseCsv(fileContent);

        // Finds the index of the visitor to update.
        const visitorIndex = visitors.findIndex(v => v.id && updatedVisitor.id && v.id.trim() === updatedVisitor.id.trim());

        if (visitorIndex !== -1) {
            // Replaces the existing visitor object with the updated one.
            visitors[visitorIndex] = updatedVisitor;
        } else {
            // Adds a new visitor if they don't exist.
            visitors.push(updatedVisitor);
        }

        // Converts the updated array back into a CSV string.
        const newCsvContent = stringifyCsv(visitors);
        // Writes the new CSV content back to the same file.
        fs.writeFileSync(lastUsedFilePath, newCsvContent, 'utf-8');

        return { success: true };
    } catch (error) {
        console.error("Error updating and saving file:", error);
        return { success: false, error: error.message }; 
    }
});

// --- Application Lifecycle ---
// This event is fired when the Electron app is ready to create browser windows.
app.whenReady().then(() => {
    createWindow();
    
    // This event is common on macOS, where the app stays in the dock even after
    // all windows are closed. This re-creates a window when the dock icon is clicked.
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quits the application when all windows are closed, unless the platform is macOS
// (where it's common for applications to remain running).
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
