/**
 * Visitor Log Application - Client Side Logic
 * Handles SQLite DB, UI updates, and Electron communication.
 */

/**
 * @typedef {Object} ElectronAPI
 * @property {Function} readCsvFile
 * @property {Function} updateAndSaveCsvFile
 * @property {Function} getCSVDirectory
 */

// --- Global State Variables ---
let db = null;
let visitorsList = [];
let selectedVisitorId = null;

let passwordInput = null;
let togglePasswordButton = null;
let eyeIcon = null;

const UNBAN_PASSWORD = "salvation_army2026";

/** * IMPORTANT: This is updated dynamically once a CSV is selected
 * to point to the 'photos' folder next to that CSV.
 */
let IMAGE_FOLDER = "";

// --- Path & Resource Setup ---

const setupPaths = async () => {
  try {
    // 1. Get the directory where the CSV is located from the Main process
    const baseDir = await window.electronAPI.getCSVDirectory();

    if (baseDir) {
      // 2. Point to the 'photos' folder using our custom protocol 'vlog-img://'
      // This bypasses security blocks and handles Windows backslashes correctly.
      IMAGE_FOLDER = `vlog-img://${baseDir}/photos`.replace(/\\/g, "/");
      console.log("Image folder initialized at:", IMAGE_FOLDER);
    } else {
      console.warn("No CSV directory found yet. IMAGE_FOLDER not set.");
    }
  } catch (err) {
    console.error("Could not retrieve resource path:", err);
    IMAGE_FOLDER = "photos"; // Basic fallback
  }
};

// --- Data Persistence Functions ---

const sqlQueryToObjects = (res) => {
  if (!res || res.length === 0) return [];
  const columns = res[0].columns;
  const values = res[0].values;
  return values.map((row) => {
    const obj = {};
    columns.forEach((col, index) => {
      obj[col] = row[index];
    });
    return obj;
  });
};

const loadVisitorsFromDb = async () => {
  const res = db.exec("SELECT * FROM visitors");
  visitorsList = sqlQueryToObjects(res);
  console.log("Visitors data loaded from SQLite:", visitorsList);
};

const saveDbToLocalStorage = () => {
  const binaryArray = db.export();
  const buffer = new Uint8Array(binaryArray);
  const stringifiedBuffer = JSON.stringify(Array.from(buffer));
  localStorage.setItem("sqliteDb", stringifiedBuffer);
};

// --- Utility Functions ---

const isVisitorBanned = (visitor) => {
  return visitor && visitor.isBanned === 1;
};

const showMessageBox = (message, type = "success") => {
  const messageBoxWrapper = document.getElementById("messageBoxWrapper");
  const messageBox = document.getElementById("messageBox");

  if (messageBoxWrapper && messageBox) {
    messageBox.textContent = message;
    messageBoxWrapper.classList.remove("hidden");

    if (type === "success") {
      messageBox.className =
        "p-3 rounded-md text-center bg-green-500 text-white";
    } else if (type === "error") {
      messageBox.className = "p-3 rounded-md text-center bg-red-500 text-white";
    }
    setTimeout(() => {
      messageBoxWrapper.classList.add("hidden");
    }, 3000);
  }
};

// --- UI Rendering Functions ---

const renderSearchResults = (visitors) => {
  const resultsContainer = document.getElementById("searchResultsContainer");
  const profileBox = document.getElementById("foundProfileBox");

  resultsContainer.innerHTML = "";
  profileBox.classList.add("hidden");

  if (visitors.length === 0) {
    resultsContainer.innerHTML =
      '<p class="text-center text-gray-500">No visitors found.</p>';
    return;
  }

  const ul = document.createElement("ul");
  ul.className = "divide-y divide-gray-200";

  visitors.forEach((visitor) => {
    const li = document.createElement("li");
    li.className =
      "p-4 hover:bg-gray-100 cursor-pointer transition-colors duration-200 rounded-lg";
    li.textContent = `${visitor.firstName} ${visitor.lastName}`;
    li.onclick = () => {
      selectedVisitorId = visitor.id;
      renderFoundProfile(visitor);
      resultsContainer.classList.add("hidden");
    };
    ul.appendChild(li);
  });

  resultsContainer.appendChild(ul);
  resultsContainer.classList.remove("hidden");
};

const renderFoundProfile = (visitor) => {
  const profileBox = document.getElementById("foundProfileBox");
  const generalNotesBox = document.getElementById("generalNotesBox");
  const statusSpan = document.getElementById("profileStatus");

  if (profileBox && generalNotesBox) {
    if (visitor) {
      // Logic for constructing the image path
      const fileName = visitor.scannedIdPicUrl
        ? visitor.scannedIdPicUrl.trim()
        : "";

      const imagePath = fileName
        ? `${IMAGE_FOLDER}/${fileName}`
        : "https://placehold.co/400x250/000000/FFFFFF?text=No+ID";

      console.log("Attempting to load image from:", imagePath);

      profileBox.classList.remove("hidden");
      document.getElementById("profileName").textContent =
        `${visitor.firstName} ${visitor.lastName}`;
      document.getElementById("profileFlat").textContent = visitor.flatNumber
        ? `Flat: ${visitor.flatNumber}`
        : "Flat: N/A";
      document.getElementById("profilePhone").textContent = visitor.phoneNumber
        ? `Phone: ${visitor.phoneNumber}`
        : "Phone: N/A";
      document.getElementById("profileDob").textContent = visitor.dateOfBirth
        ? `Date of Birth: ${visitor.dateOfBirth}`
        : "Date of Birth: N/A";
      document.getElementById("profileNotes").textContent =
        visitor.notes || "Notes: N/A";

      // Update the profile image source
      document.getElementById("profileImage").src = imagePath;

      const isBanned = isVisitorBanned(visitor);
      if (isBanned) {
        statusSpan.textContent = "BANNED";
        statusSpan.className = "profile-status banned";
      } else {
        statusSpan.textContent = "CLEARED";
        statusSpan.className = "profile-status cleared";
      }

      document.getElementById("profileBanButton").onclick = () =>
        openBanModal(visitor.id);
      document.getElementById("profileUnbanButton").onclick = () =>
        openUnbanModal(visitor.id);

      generalNotesBox.classList.remove("hidden");
      document.getElementById("generalNotesInput").value =
        visitor.generalNotes || "";
    } else {
      profileBox.classList.add("hidden");
      generalNotesBox.classList.add("hidden");
    }
  }
};

// --- Modal Handlers ---

const openBanModal = (visitorId) => {
  selectedVisitorId = visitorId;
  const visitorData = visitorsList.find((v) => v.id === visitorId);
  document.getElementById("modalNotes").value = visitorData?.notes || "";
  document.getElementById("banModal").classList.remove("hidden");
};

const hideBanModal = () =>
  document.getElementById("banModal").classList.add("hidden");

const openUnbanModal = (visitorId) => {
  selectedVisitorId = visitorId;
  document.getElementById("unbanModal").classList.remove("hidden");
  document.getElementById("unbanPasswordInput").value = "";
};

const hideUnbanModal = () =>
  document.getElementById("unbanModal").classList.add("hidden");

// --- Event Handlers ---

const handleSearch = (e) => {
  const searchTerm = e.target.value.toLowerCase().trim();
  const searchResultsContainer = document.getElementById(
    "searchResultsContainer",
  );

  if (searchTerm.length === 0) {
    selectedVisitorId = null;
    renderFoundProfile(null);
    searchResultsContainer.classList.add("hidden");
    return;
  }

  const searchTerms = searchTerm.split(/\s+/).filter((term) => term.length > 0);
  const foundVisitors = visitorsList.filter((v) => {
    return searchTerms.every(
      (term) =>
        (v.firstName && v.firstName.toLowerCase().includes(term)) ||
        (v.lastName && v.lastName.toLowerCase().includes(term)),
    );
  });

  const exactMatch = foundVisitors.find(
    (v) =>
      `${v.firstName.toLowerCase()} ${v.lastName.toLowerCase()}` === searchTerm,
  );

  if (exactMatch) {
    selectedVisitorId = exactMatch.id;
    renderFoundProfile(exactMatch);
    searchResultsContainer.classList.add("hidden");
  } else {
    renderSearchResults(foundVisitors);
    renderFoundProfile(null);
  }
};

const updateVisitorStatus = async (visitorId, newStatus) => {
  if (!visitorId) return;
  try {
    const isBanned = newStatus.isBanned ? 1 : 0;
    const notes = newStatus.notes || "";
    db.run("UPDATE visitors SET isBanned = ?, notes = ? WHERE id = ?", [
      isBanned,
      notes,
      visitorId,
    ]);
    saveDbToLocalStorage();
    await loadVisitorsFromDb();
    renderFoundProfile(visitorsList.find((v) => v.id === visitorId));
    showMessageBox("Status updated!", "success");
  } catch (error) {
    showMessageBox("Update failed.", "error");
  }
};

const handleUnbanConfirm = async () => {
  if (passwordInput.value === UNBAN_PASSWORD) {
    if (!selectedVisitorId) return;

    await updateVisitorStatus(selectedVisitorId, {
      isBanned: false,
      notes: "",
    });
    hideUnbanModal();

    // security check
    passwordInput.setAttribute("type", "password");
    eyeIcon.classList.remove("text-green-500");
    showMessageBox("Visitor unbanned.", "success");
  } else {
    showMessageBox("Incorrect password.", "error");
    passwordInput.value = "";
  }
};

// --- CSV Logic ---

const parseCsv = (csvText) => {
  const lines = csvText.trim().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const visitor = {};
    headers.forEach((h, index) => {
      visitor[h === "visitorId" ? "id" : h] = values[index];
    });
    return visitor;
  });
};

const handleImport = async (csvData) => {
  if (!csvData) return;
  const importedVisitors = parseCsv(csvData);
  try {
    db.run("BEGIN TRANSACTION;");
    for (const v of importedVisitors) {
      if (!v.firstName || !v.lastName) continue;
      const visitorId = v.id || uuidv4();
      const isBanned = v.isBanned === "true" || v.isBanned === "1" ? 1 : 0;
      db.run(
        `INSERT OR REPLACE INTO visitors 
        (id, firstName, lastName, flatNumber, phoneNumber, dateOfBirth, scannedIdPicUrl, isBanned, notes, generalNotes) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          visitorId,
          v.firstName,
          v.lastName,
          v.flatNumber,
          v.phoneNumber,
          v.dateOfBirth,
          v.scannedIdPicUrl,
          isBanned,
          v.notes,
          v.generalNotes || "",
        ],
      );
    }
    db.run("COMMIT;");
    saveDbToLocalStorage();
    await loadVisitorsFromDb();
  } catch (error) {
    db.run("ROLLBACK;");
    console.error("CSV Import Error:", error);
  }
};

//handle export form db to csv

const handleExport = async () => {
  // 1. Get latest data from the DB
  const res = db.exec("SELECT * FROM visitors");
  const data = sqlQueryToObjects(res);

  if (data.length === 0) {
    showMessageBox("No data to export!", "error");
    return;
  }

  // 2. Loop through and update each visitor in the CSV file
  try {
    for (const visitor of data) {
      await window.electronAPI.updateAndSaveCsvFile(visitor);
    }
    showMessageBox("CSV updated successfully!", "success");
  } catch (err) {
    console.error("Export failed:", err);
    showMessageBox("Export failed.", "error");
  }
};

// --- Initialization ---

const initializeDb = async () => {
  try {
    // 1. Init SQL.js first
    const SQL = await initSqlJs({
      locateFile: (file) =>
        `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`,
    });

    const storedDb = localStorage.getItem("sqliteDb");
    db = storedDb
      ? new SQL.Database(new Uint8Array(JSON.parse(storedDb)))
      : new SQL.Database();

    db.run(`
      CREATE TABLE IF NOT EXISTS visitors (
          id TEXT PRIMARY KEY,
          firstName TEXT,
          lastName TEXT,
          flatNumber TEXT,
          phoneNumber TEXT,
          dateOfBirth TEXT,
          scannedIdPicUrl TEXT,
          isBanned INTEGER,
          notes TEXT,
          generalNotes TEXT
      );
    `);

    await loadVisitorsFromDb();

    // 2. Open File Dialog to import CSV
    const csvData = await window.electronAPI.readCsvFile();

    if (csvData) {
      //  Initialize image paths only after  the file is chosen
      await setupPaths();
      await handleImport(csvData);
      const visitorCount = visitorsList.length;
      showMessageBox(
        `Successfully loaded ${visitorCount} visitors from CSV.`,
        "success",
      );
    }

    // 3. Set up UI Event Listeners
    document.getElementById("search").addEventListener("input", handleSearch);
    document
      .getElementById("modalCancelButton")
      .addEventListener("click", hideBanModal);
    document
      .getElementById("modalConfirmBanButton")
      .addEventListener("click", () => {
        const notes = document.getElementById("modalNotes").value;
        updateVisitorStatus(selectedVisitorId, { isBanned: true, notes });
        hideBanModal();
      });
    document
      .getElementById("unbanCancelButton")
      .addEventListener("click", hideUnbanModal);
    document
      .getElementById("unbanConfirmButton")
      .addEventListener("click", handleUnbanConfirm);

    document
      .getElementById("saveGeneralNotesButton")
      .addEventListener("click", () => {
        const notes = document.getElementById("generalNotesInput").value;
        if (selectedVisitorId) {
          db.run("UPDATE visitors SET generalNotes = ? WHERE id = ?", [
            notes,
            selectedVisitorId,
          ]);
          saveDbToLocalStorage();
          showMessageBox("Notes saved!", "success");
        }
      });

    // assign to variables.
    passwordInput = document.getElementById("unbanPasswordInput");
    togglePasswordButton = document.getElementById("togglePassword");
    eyeIcon = document.getElementById("eyeIcon");

    // listener for the password and toggle
    togglePasswordButton.addEventListener("click", () => {
      const type =
        passwordInput.getAttribute("type") === "password" ? "text" : "password";
      passwordInput.setAttribute("type", type);

      if (type === "text") {
        eyeIcon.classList.add("text-green-500");
      } else {
        eyeIcon.classList.remove("text-green-500");
      }
    });

    document
      .getElementById("export-btn")
      .addEventListener("click", handleExport);

    // display the date
    document.getElementById("current-date").textContent =
      new Date().toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

    // Reveal the app UI
    document.getElementById("loading").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
  } catch (error) {
    console.error("Initialization error:", error);
  }
};
// A universally unique identifier version4 that give each visitor a unique id
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

window.onload = initializeDb;
