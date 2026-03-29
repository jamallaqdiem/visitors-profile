const { app, BrowserWindow, ipcMain, dialog, protocol } = require("electron");
const path = require("node:path");
const fs = require("fs");
app.disableHardwareAcceleration();

// --- Global State Variable ---
let lastUsedFilePath = null;

// 1. MUST register schemes before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: "vlog-img", privileges: { bypassCSP: true, stream: true } },
]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, // Made a bit wider for better dev-tool viewing
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadFile("index.html");
}

// --- NEW: The Missing Link Handler ---
// This tells the frontend where the CSV was opened from
ipcMain.handle("get-file-dir", async () => {
  if (lastUsedFilePath) {
    return path.dirname(lastUsedFilePath);
  }
  return null;
});

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
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return [];

  // Trims headers to remove whitespace.
  const headers = lines[0].split(",").map((header) => header.trim());
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
      if (line[j] === '"' && (j === 0 || line[j - 1] !== "\\")) {
        inQuote = !inQuote;
      } else if (line[j] === "," && !inQuote) {
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
      lastValue = lastValue
        .substring(1, lastValue.length - 1)
        .replace(/""/g, '"');
    }
    values.push(lastValue);

    const row = {};
    let hasId = false;
    headers.forEach((header, index) => {
      // Replaces 'visitorId' with 'id' for consistency.
      const key = header === "visitorId" ? "id" : header;
      row[key] = values[index] ? values[index].trim() : "";
      if (key === "id" && row[key]) {
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
  if (visitors.length === 0) return "";

  // Gets the headers from the first object.
  const headers = Object.keys(visitors[0]);
  const headerRow = headers.join(",");

  const rows = visitors.map((visitor) => {
    return headers
      .map((header) => {
        const value = visitor[header];
        // Checks if a value needs to be wrapped in quotes.
        const needsQuotes =
          typeof value === "string" &&
          (value.includes(",") || value.includes('"'));
        let formattedValue =
          value === null || value === undefined ? "" : value.toString();

        if (needsQuotes) {
          // Escapes any double quotes within the value.
          formattedValue = `"${formattedValue.replace(/"/g, '""')}"`;
        }
        return formattedValue;
      })
      .join(",");
  });

  // Joins header and data rows with a newline.
  return [headerRow, ...rows].join("\n");
};

// --- IPC Communication Handlers ---
// Handles the request from the renderer process to open a file dialog and read a CSV file.
ipcMain.handle("dialog:readCsvFile", async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "CSV Files", extensions: ["csv"] }],
    });

    if (canceled || filePaths.length === 0) {
      return null; // Returns null if the user cancels.
    } else {
      const filePath = filePaths[0];
      lastUsedFilePath = filePath; // Stores the path for future saves.
      const fileContent = fs.readFileSync(filePath, "utf-8");
      return fileContent;
    }
  } catch (error) {
    console.error("Error reading file:", error);
    return null;
  }
});

// Handles the request to update and save the CSV file with the updated visitor data.
ipcMain.handle("dialog:updateAndSaveCsvFile", async (event, updatedVisitor) => {
  if (!lastUsedFilePath) {
    return {
      success: false,
      error: "No file has been selected for saving yet.",
    };
  }

  try {
    // Reads the existing file content.
    const fileContent = fs.readFileSync(lastUsedFilePath, "utf-8");
    // Parses the content into an array of visitor objects.
    const visitors = parseCsv(fileContent);

    // Finds the index of the visitor to update.
    const visitorIndex = visitors.findIndex(
      (v) =>
        v.id && updatedVisitor.id && v.id.trim() === updatedVisitor.id.trim(),
    );

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
    fs.writeFileSync(lastUsedFilePath, newCsvContent, "utf-8");

    return { success: true };
  } catch (error) {
    console.error("Error updating and saving file:", error);
    return { success: false, error: error.message };
  }
});

// --- Application Lifecycle ---
// This event is fired when the Electron app is ready to create browser windows.
app.whenReady().then(() => {
  // 2. Set up the protocol handler properly
  protocol.registerFileProtocol("vlog-img", (request, callback) => {
    const url = request.url.replace("vlog-img://", "");
    try {
      // decodeURIComponent is vital for Windows paths with spaces!
      return callback(decodeURIComponent(url));
    } catch (error) {
      console.error("Protocol error:", error);
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
