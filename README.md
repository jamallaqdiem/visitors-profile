
Visitor Management System
This is a desktop application built with Electron, providing a secure and efficient way to manage visitor information. It features a local, persistent database, and integrates directly with the user's file system for importing and exporting data.

Owner
Jamal Laqdiem

Features
Secure Desktop Environment: Runs as a native application on Windows, macOS, and Linux, providing a fast and isolated user experience.

Persistent Data Storage: Using a local storage a csv file.

Search Functionality: Quickly find visitor profiles using a responsive search bar.

Visitor Status Management: Easily ban or unban visitors with a password-protected confirmation system.

CSV Import & Export: Import existing visitor data from a CSV file and export updated profiles back to the file system.

Secure IPC Communication: Uses Electron's contextBridge to securely pass data between the renderer (UI) and main (Node.js) processes.

Technologies Used
Electron: For building the cross-platform desktop application.

Node.js: The core runtime environment used in Electron's main process for file system access and other native tasks.

SQLite: The lightweight relational database for local data storage, implemented in the browser using sql.js.

HTML, CSS, tailwindcss & JavaScript: The foundation of the application's user interface.

CSS Framework: Utilizes a modern CSS framework for responsive and professional styling.

Getting Started
To get a local copy up and running, follow these steps.

Prerequisites
You must have Node.js and npm installed on your machine.

Installation
Clone the repository to your local machine:

git clone https://github.com/jamallaqdiem/visitors-profile/tree/create-electron

Navigate to the project directory:

cd visitor-management-system

Install the dependencies:

npm install

Running the Application
To start the application in development mode, run the following command:
npm start

npm start
