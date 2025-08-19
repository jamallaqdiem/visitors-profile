// This file manages the client-side logic for the visitor log application.
// It handles database initialization, UI updates, and interaction with the browser's
// local storage, as well as communication with the main Electron process for file operations.

// --- Global State Variables ---
let db = null;
let visitorsList = [];
let selectedVisitorId = null;
const UNBAN_PASSWORD = "";
const IMAGE_FOLDER = 'photos';

// --- Data Persistence Functions using sql.js ---

/**
 * Converts a SQLite query result object into a clean array of JavaScript objects.
 * This function makes the data from the SQLite database easier to work with by transforming
 * it from a raw query result into a standard array of objects.
 *
 * @param {Object[]} res - The result array from db.exec().
 * @returns {Object[]} An array of objects, where each object represents a row.
 */
const sqlQueryToObjects = (res) => {
    if (!res || res.length === 0) return [];
    const columns = res[0].columns;
    const values = res[0].values;
    return values.map(row => {
        const obj = {};
        columns.forEach((col, index) => {
            obj[col] = row[index];
        });
        return obj;
    });
};

/**
 * Loads all visitor data from the SQLite database into the global visitorsList array.
 * This is a core function for populating the application's in-memory data store from the database.
 */
const loadVisitorsFromDb = async () => {
    const res = db.exec("SELECT * FROM visitors");
    visitorsList = sqlQueryToObjects(res);
    console.log("Visitors data loaded from SQLite:", visitorsList);
};

/**
 * Saves the current state of the SQLite database to the browser's local storage.
 * This is crucial for data persistence, ensuring that changes are saved and
 * available the next time the user opens the application.
 */
const saveDbToLocalStorage = () => {
    const binaryArray = db.export();
    const buffer = new Uint8Array(binaryArray);
    const stringifiedBuffer = JSON.stringify(Array.from(buffer));
    localStorage.setItem('sqliteDb', stringifiedBuffer);
};

// --- Utility Functions ---

/**
 * Checks if a visitor is currently banned.
 * This utility function provides a clear, boolean check for a visitor's status.
 *
 * @param {Object} visitor - The visitor object.
 * @returns {boolean} True if the visitor is banned, false otherwise.
 */
const isVisitorBanned = (visitor) => {
    return visitor && visitor.isBanned === 1;
};

/**
 * Displays a temporary message box for user feedback.
 * This function is used to show success or error messages to the user in a standardized way.
 *
 * @param {string} message - The message to display.
 * @param {string} type - The type of message ('success' or 'error') to determine styling.
 */
const showMessageBox = (message, type = 'success') => {
    const messageBoxWrapper = document.getElementById('messageBoxWrapper');
    const messageBox = document.getElementById('messageBox');
    
    if (messageBoxWrapper && messageBox) {
        messageBox.textContent = message;
        messageBoxWrapper.classList.remove('hidden');

        if (type === 'success') {
            messageBox.className = 'p-3 rounded-md text-center bg-green-500 text-white';
        } else if (type === 'error') {
            messageBox.className = 'p-3 rounded-md text-center bg-red-500 text-white';
        }
        setTimeout(() => {
            messageBoxWrapper.classList.add('hidden');
        }, 3000);
    }
};

// --- UI Rendering Functions ---

/**
 * Renders the list of search results.
 * This function displays a list of all matching visitors for selection.
 *
 * @param {Array} visitors - The array of visitor objects to display.
 */
const renderSearchResults = (visitors) => {
    const resultsContainer = document.getElementById('searchResultsContainer');
    const profileBox = document.getElementById('foundProfileBox');
    
    // Clear previous results and profile box
    resultsContainer.innerHTML = '';
    profileBox.classList.add('hidden');
    
    if (visitors.length === 0) {
        resultsContainer.innerHTML = '<p class="text-center text-gray-500">No visitors found.</p>';
        return;
    }
    
    const ul = document.createElement('ul');
    ul.className = 'divide-y divide-gray-200';
    
    visitors.forEach(visitor => {
        const li = document.createElement('li');
        li.className = 'p-4 hover:bg-gray-100 cursor-pointer transition-colors duration-200 rounded-lg';
        li.textContent = `${visitor.firstName} ${visitor.lastName} (Flat: ${visitor.flatNumber || 'N/A'})`;
        li.onclick = () => {
            selectedVisitorId = visitor.id;
            renderFoundProfile(visitor);
            resultsContainer.classList.add('hidden'); // Hide results after selection
        };
        ul.appendChild(li);
    });
    
    resultsContainer.appendChild(ul);
    resultsContainer.classList.remove('hidden'); // Show the results container
};

/**
 * Displays a single visitor's detailed profile.
 * This function is responsible for dynamically populating the HTML elements of the profile box
 * with the selected visitor's data, including their status (banned/cleared).
 *
 * @param {Object} visitor - The visitor object.
 */
const renderFoundProfile = (visitor) => {
    const profileBox = document.getElementById('foundProfileBox');
    const generalNotesBox = document.getElementById('generalNotesBox');
    const statusSpan = document.getElementById('profileStatus');

    if (profileBox && generalNotesBox) {
        if (visitor) {
            console.log("Rendering visitor profile:", visitor);
            const imagePath = visitor.scannedIdPicUrl ? 
                `${IMAGE_FOLDER}/${visitor.scannedIdPicUrl}` : 
                'https://placehold.co/400x250/000000/FFFFFF?text=No+ID';

            profileBox.classList.remove('hidden');
            document.getElementById('profileName').textContent = `${visitor.firstName} ${visitor.lastName}`;
            document.getElementById('profileFlat').textContent = (visitor.flatNumber && visitor.flatNumber.length > 0) ? `Flat: ${visitor.flatNumber}` : 'Flat: N/A';
            document.getElementById('profilePhone').textContent = visitor.phoneNumber ? `Phone: ${visitor.phoneNumber}` : 'Phone: N/A';
            document.getElementById('profileDob').textContent = visitor.dateOfBirth ? `Date of Birth: ${visitor.dateOfBirth}` : 'Date of Birth: N/A';
            document.getElementById('profileNotes').textContent = visitor.notes || 'Notes: N/A';
            document.getElementById('profileImage').src = imagePath;

            const isBanned = isVisitorBanned(visitor);

            if (isBanned) {
                statusSpan.textContent = 'BANNED';
                statusSpan.className = 'profile-status banned';
            } else {
                statusSpan.textContent = 'CLEARED';
                statusSpan.className = 'profile-status cleared';
            }

            document.getElementById('profileBanButton').onclick = () => openBanModal(visitor.id);
            document.getElementById('profileUnbanButton').onclick = () => openUnbanModal(visitor.id);

            generalNotesBox.classList.remove('hidden');
            document.getElementById('generalNotesInput').value = visitor.generalNotes || '';
        } else {
            profileBox.classList.add('hidden');
            generalNotesBox.classList.add('hidden');
        }
    }
};

/**
 * Opens the ban confirmation modal.
 *
 * @param {string} visitorId - The ID of the visitor to be banned.
 */
const openBanModal = (visitorId) => {
    selectedVisitorId = visitorId;
    const visitorData = visitorsList.find(v => v.id === visitorId);
    document.getElementById('modalNotes').value = visitorData?.notes || '';
    document.getElementById('banModal').classList.remove('hidden');
};

/**
 * Hides the ban confirmation modal.
 */
const hideBanModal = () => {
    document.getElementById('banModal').classList.add('hidden');
};

/**
 * Opens the unban confirmation modal.
 *
 * @param {string} visitorId - The ID of the visitor to be unbanned.
 */
const openUnbanModal = (visitorId) => {
    selectedVisitorId = visitorId;
    document.getElementById('unbanModal').classList.remove('hidden');
    document.getElementById('unbanPasswordInput').value = ''; // Clear previous password
};

/**
 * Hides the unban confirmation modal.
 */
const hideUnbanModal = () => {
    document.getElementById('unbanModal').classList.add('hidden');
};

// --- Event Handlers and SQLite Logic ---

/**
 * Updated search handler to find all matching visitors and handle full name search.
 * @param {Event} e - The input event from the search bar.
 */
const handleSearch = (e) => {
    const searchTerm = e.target.value.toLowerCase().trim();
    const searchResultsContainer = document.getElementById('searchResultsContainer');

    if (searchTerm.length === 0) {
        selectedVisitorId = null;
        renderFoundProfile(null); // Hide profile box
        searchResultsContainer.classList.add('hidden'); // Hide results container
        return;
    }

    // Split the search term into parts by spaces
    const searchTerms = searchTerm.split(/\s+/).filter(term => term.length > 0);

    const foundVisitors = visitorsList.filter(visitor => {
        // Check if all search terms are present in either the first or last name
        return searchTerms.every(term => 
            (visitor.firstName && visitor.firstName.toLowerCase().includes(term)) ||
            (visitor.lastName && visitor.lastName.toLowerCase().includes(term))
        );
    });

    // If a perfect match is found, show that profile directly
    const exactMatch = foundVisitors.find(v => `${v.firstName.toLowerCase()} ${v.lastName.toLowerCase()}` === searchTerm);
    if (exactMatch) {
        selectedVisitorId = exactMatch.id;
        renderFoundProfile(exactMatch);
        searchResultsContainer.classList.add('hidden');
    } else {
        // Otherwise, show all potential matches in a list
        renderSearchResults(foundVisitors);
        renderFoundProfile(null); // Hide the single profile box
    }
};

/**
 * Updates a visitor's banned status and notes in the database.
 *
 * @param {string} visitorId - The ID of the visitor to update.
 * @param {Object} newStatus - An object containing the new status ({ isBanned: boolean, notes: string }).
 */
const updateVisitorStatus = async (visitorId, newStatus) => {
    if (!visitorId) return;
    try {
        const isBanned = newStatus.isBanned ? 1 : 0;
        const notes = newStatus.notes || '';

        db.run("UPDATE visitors SET isBanned = ?, notes = ? WHERE id = ?", [isBanned, notes, visitorId]);
        
        saveDbToLocalStorage();
        await loadVisitorsFromDb();
        renderFoundProfile(visitorsList.find(v => v.id === visitorId));
        
        showMessageBox('Visitor status updated successfully!', 'success');
    } catch (error) {
        console.error("Error updating visitor status in SQLite:", error);
        showMessageBox('Failed to update visitor status.', 'error');
    }
};

/**
 * Updates a visitor's general notes in the database.
 *
 * @param {string} visitorId - The ID of the visitor to update.
 * @param {string} notes - The new general notes text.
 */
const updateGeneralNotes = async (visitorId, notes) => {
    if (!visitorId) {
        showMessageBox('Please search for a visitor first.', 'error');
        return;
    }
    try {
        db.run("UPDATE visitors SET generalNotes = ? WHERE id = ?", [notes, visitorId]);
        
        saveDbToLocalStorage();
        await loadVisitorsFromDb();
        renderFoundProfile(visitorsList.find(v => v.id === visitorId));

        showMessageBox('Notes saved successfully!', 'success');
    } catch (error) {
        console.error("Error updating general notes in SQLite:", error);
        showMessageBox('Failed to save notes.', 'error');
    }
};

/**
 * Handles the confirmation of a ban action.
 */
const handleBanConfirm = () => {
    if (!selectedVisitorId) return;
    const notes = document.getElementById('modalNotes').value;
    updateVisitorStatus(selectedVisitorId, { isBanned: true, notes });
    hideBanModal();
};

/**
 * Handles the confirmation of an unban action.
 */
const handleUnbanConfirm = async () => {
    const passwordInput = document.getElementById('unbanPasswordInput');
    const enteredPassword = passwordInput.value;
    if (enteredPassword === UNBAN_PASSWORD) {
        if (!selectedVisitorId) return;
        await updateVisitorStatus(selectedVisitorId, { isBanned: false, notes: ''});
        hideUnbanModal();
        showMessageBox('Visitor has been unbanned.', 'success');
    } else {
        showMessageBox('Incorrect password.', 'error');
        passwordInput.value = '';
    }
};

// --- CSV Import/Export Logic ---

/**
 * Parses a CSV string into an array of visitor objects.
 *
 * @param {string} csvText - The raw CSV data as a string.
 * @returns {Object[]} An array of visitor objects.
 */
const parseCsv = (csvText) => {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',').map(header => header.trim());
    const data = lines.slice(1).map(line => {
        const values = line.split(',').map(value => value.trim());
        const visitor = {};
        headers.forEach((header, index) => {
            visitor[header] = values[index];
        });
        return visitor;
    });
    return data;
};

/**
 * Converts a given array of visitor objects back into a CSV formatted string.
 *
 * @param {Object[]} visitorsToExport - An array of visitor objects to export.
 * @returns {string} The CSV data as a string.
 */
const generateCsv = (visitorsToExport) => {
    if (!visitorsToExport || visitorsToExport.length === 0) return '';
    const headers = ["id", "firstName", "lastName", "flatNumber", "phoneNumber", "dateOfBirth", "scannedIdPicUrl", "isBanned", "notes", "generalNotes"];
    const headerRow = headers.join(',');
    const rows = visitorsToExport.map(visitor => {
        return headers.map(header => {
            const value = visitor[header];
            return `"${(value === null || value === undefined) ? '' : value.toString().replace(/"/g, '""')}"`;
        }).join(',');
    });
    return [headerRow, ...rows].join('\n');
};

/**
 * Handles the import of a CSV file.
 *
 * @param {string} csvData - The raw CSV data as a string.
 */
const handleImport = async (csvData) => {
    if (!csvData) {
        return;
    }
    const importedVisitors = parseCsv(csvData);
    let importedCount = 0;
    try {
        console.log("Parsed CSV Data:", importedVisitors);
        db.run("BEGIN TRANSACTION;");
        for (const visitor of importedVisitors) {
            if (!visitor.firstName || !visitor.lastName) {
                console.error("Skipping a row due to missing firstName or lastName:", visitor);
                continue;
            }
            const visitorId = visitor.id || uuidv4();
            const isBanned = visitor.isBanned === 'true' || visitor.isBanned === '1' ? 1 : 0;
            const existingVisitor = db.exec("SELECT * FROM visitors WHERE id = ?", [visitorId]);
            
            if (existingVisitor.length > 0) {
                console.log(`Updating existing visitor with ID: ${visitorId}`);
                db.run(
                    "UPDATE visitors SET firstName = ?, lastName = ?, flatNumber = ?, phoneNumber = ?, dateOfBirth = ?, scannedIdPicUrl = ?, isBanned = ?, notes = ? WHERE id = ?",
                    [
                        visitor.firstName,
                        visitor.lastName,
                        visitor.flatNumber,
                        visitor.phoneNumber,
                        visitor.dateOfBirth,
                        visitor.scannedIdPicUrl,
                        isBanned,
                        visitor.notes,
                        visitorId
                    ]
                );
            } else {
                console.log(`Inserting new visitor with ID: ${visitorId}`);
                db.run(
                    "INSERT INTO visitors (id, firstName, lastName, flatNumber, phoneNumber, dateOfBirth, scannedIdPicUrl, isBanned, notes, generalNotes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", 
                    [
                        visitorId,
                        visitor.firstName,
                        visitor.lastName,
                        visitor.flatNumber,
                        visitor.phoneNumber,
                        visitor.dateOfBirth,
                        visitor.scannedIdPicUrl,
                        isBanned,
                        visitor.notes,
                        '',
                    ]
                );
            }
            importedCount++;
        }
        db.run("COMMIT;");
        saveDbToLocalStorage();
        await loadVisitorsFromDb();
        showMessageBox(`Successfully imported ${importedCount} visitor(s).`, 'success');

    } catch (error) {
        db.run("ROLLBACK;");
        console.error("Error during CSV import:", error);
        showMessageBox('Failed to import data.', 'error');
    }
};

/**
 * Handles the export to CSV button click.
 * It generates the CSV data and sends it to the main process for saving.
 */
const handleExport = async () => {
    if (!selectedVisitorId) {
        showMessageBox('Please search for and select a visitor to export.', 'error');
        return;
    }
    
    // Find the single visitor object to export from the global list
    const visitorToExport = visitorsList.find(v => v.id === selectedVisitorId);
    
    if (visitorToExport) {
        // Create an updated object that includes the current notes from the UI.
        const updatedVisitorData = {
            id: visitorToExport.id,
            firstName: visitorToExport.firstName,
            lastName: visitorToExport.lastName,
            flatNumber: visitorToExport.flatNumber,
            phoneNumber: visitorToExport.phoneNumber,
            dateOfBirth: visitorToExport.dateOfBirth,
            scannedIdPicUrl: visitorToExport.scannedIdPicUrl,
            isBanned: visitorToExport.isBanned,
            notes: visitorToExport.notes,
            generalNotes: document.getElementById('generalNotesInput').value, // Get the most recent notes from the UI
        };

        try {
            // Pass the single, updated visitor object to the main process
            const result = await window.electronAPI.updateAndSaveCsvFile(updatedVisitorData);

            if (result.success) {
                showMessageBox('Visitor data updated in CSV successfully!', 'success');
            } else {
                showMessageBox(`Export failed: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error during CSV export:', error);
            showMessageBox('An error occurred during export.', 'error');
        }
    } else {
        showMessageBox('Selected visitor not found.', 'error');
    }
};


// --- Main Initialization Logic ---
const initializeDb = async () => {
    try {
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}`
        });

        const storedDb = localStorage.getItem('sqliteDb');
        if (storedDb) {
            const binaryArray = JSON.parse(storedDb);
            db = new SQL.Database(new Uint8Array(binaryArray));
            console.log("Database loaded from local storage.");
        } else {
            db = new SQL.Database();
            console.log("New database created.");
        }
        
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

        // Fix for old database schemas - ensures all columns exist
        try {
            db.exec("ALTER TABLE visitors ADD COLUMN phoneNumber TEXT;");
            console.log("Added 'phoneNumber' column to the visitors table.");
        } catch (e) { /* Column already exists */ }
        try {
            db.exec("ALTER TABLE visitors ADD COLUMN generalNotes TEXT;");
            console.log("Added 'generalNotes' column to the visitors table.");
        } catch (e) { /* Column already exists */ }

        await loadVisitorsFromDb();

        const csvData = await window.electronAPI.readCsvFile();
        if (csvData) {
            handleImport(csvData);
        } else {
            showMessageBox('CSV import canceled or failed.', 'error');
        }

        // --- Event Listeners ---
        document.getElementById('search').addEventListener('input', handleSearch);
        document.getElementById('export-btn').addEventListener('click', handleExport);
        
        // Ban Modal Listeners
        document.getElementById('modalCancelButton').addEventListener('click', hideBanModal);
        document.getElementById('modalConfirmBanButton').addEventListener('click', handleBanConfirm);
        
        // Unban Modal Listeners
        document.getElementById('unbanCancelButton').addEventListener('click', hideUnbanModal);
        document.getElementById('unbanConfirmButton').addEventListener('click', handleUnbanConfirm);

        document.getElementById('saveGeneralNotesButton').addEventListener('click', () => {
            const notes = document.getElementById('generalNotesInput').value;
            updateGeneralNotes(selectedVisitorId, notes);
        });

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');

    } catch (error) {
        console.error("Error initializing SQLite database:", error);
        document.body.innerHTML = `<div class="flex items-center justify-center min-h-screen bg-red-900 text-white"><p class="text-xl">Failed to load app. Check console for errors.</p></div>`;
    }
};

// A simple utility function to generate a unique ID
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

window.onload = initializeDb;