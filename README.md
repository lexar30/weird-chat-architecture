⚠️ Experimental / Proof of Concept

This project is a vibe-coded experimental prototype created to test an architectural idea:

Web chat client hosted on GitHub Pages using Google Sheets as encrypted message storage via a Service Account.

It is not a production-ready application.



# Web Chat on GitHub Pages and Google Sheets

## Overview

This project implements a simple web chat where all messages are stored in Google Sheets. The client side is deployed on GitHub Pages and runs entirely in the browser. A Google service account is used to access the spreadsheet, and message text is encrypted before being written. The architecture consists of three components:

1. **Frontend on GitHub Pages.** A static web page (`index.html`, `app.js`, `crypto.js`) displays two screens: a chat connection screen and the message window. The client handles the entire user interface, encryption/decryption using the Web Crypto API, and interaction with Google Sheets via the REST API.
2. **Google Sheets.** The spreadsheet is used as the message storage. A sheet named `messages` is created with the columns `id`, `timestamp`, `ciphertext`, and `version`. Only encrypted messages are stored in the table.
3. **Service Account.** The user generates a JSON key file for a service account in the Google Cloud Console. This key is uploaded into the browser, where a JWT signature is generated from it and an OAuth token is requested for access to the Sheets API. The token is then used in requests to Google Sheets.

## How It Works

1. The user opens the page on GitHub Pages. A connection form is shown with three fields: a multiline field for the service account JSON key, a `Name` field, and a `Seed` field (a string acting as a password).
2. When **CONNECT** is pressed, the client:
   - parses the JSON key and extracts `client_email` and `private_key`;
   - performs a cryptographic transformation: an AES-GCM 256-bit key is derived from the entered `Seed` using PBKDF2 (100,000 iterations, SHA-256, salt `"ghpages-chat-v1"`);
   - signs a JWT with the fields `iss`, `scope`, `aud`, `iat`, and `exp`, and exchanges it for an OAuth `access_token` via the endpoint `https://oauth2.googleapis.com/token` using the JWT Bearer flow;
   - tests access by reading existing messages from the `messages` sheet.
3. After a successful connection, the chat window opens. Messages are loaded from Google Sheets using `spreadsheets.values.get`. New messages are written using `spreadsheets.values.append` with the parameters `valueInputOption=RAW` and `insertDataOption=INSERT_ROWS`.
4. The user can send a text message (**SEND**) or trigger slots (**SPIN**). In the case of `SPIN`, the client randomly selects three symbols from the set `➉︎`, `❤︎`, `☮︎`, `☆︎` and forms a string like `| ❤︎ | ☆︎ | ☮︎ |`. The message is encrypted and sent like a normal message.
5. Every 10 seconds, the client polls Google Sheets for new rows. If new rows are found, the client decrypts the messages and displays them in the chat.

## Security and Limitations

**Important:** the service account and the `Seed` key are entered by the user directly in the browser. All client logic runs entirely on the user’s side. The following limitations should be considered:

- The service account JSON key is not stored on a server, but it is not truly secret: anyone who has the key can gain read and write access to the Google Sheets document. This chat should therefore be considered a closed channel between participants who have pre-shared the service key and the encryption seed. **The system is unreliable and not intended for sensitive data or commercial use.**
- There is no real authorization: anyone who knows the key can write under any name. There are no user blocking mechanisms.
- Updates are performed via polling every 10 seconds, so the chat is not real-time. Google API quota limits may restrict frequent requests.
- The maximum message length is limited to 1000 characters to avoid excessive cell size usage.
- Additional risks: no protection against duplication except message UUID; no limits on the number of connections; the service account is not protected; the encryption version is fixed as `v1`.

## Google Cloud Setup

1. Create a new project in the Google Cloud Console.
2. Enable the **Google Sheets API** and, if necessary, the **Google Drive API**.
3. Create a service account with an “Editor” role for Google Sheets and obtain a JSON key:
   - Go to **IAM & Admin → Service Accounts** and create a new account.
   - Assign the **Editor** role or a more restrictive one if possible.
   - Generate a JSON key and download it.
4. Create a Google Sheets document (the name can be arbitrary). Add a sheet named `messages` and in the first row specify the headers: `id`, `timestamp`, `ciphertext`, `version`. These columns must be in this exact order.
5. In the sharing settings, add the service account email as an editor of the spreadsheet.
6. Save the spreadsheet ID (the part of the URL between `/d/` and `/edit`) and replace the string `YOUR_SPREADSHEET_ID_HERE` in `app.js` with this ID.

## Deployment on GitHub Pages

1. Create a new GitHub repository and add the contents of the `frontend` folder to it. The project structure should look like this:
project-root/
├── frontend/
│ ├── index.html
│ ├── app.js
│ ├── crypto.js
│ └── styles.css
├── README.md
└── setup-guide.md

2. Commit and push the repository. In the repository settings on GitHub, go to the **Pages** section and choose publishing from the `main` branch (or another branch if used) and the `/frontend` folder. After activation, a public URL like `https://username.github.io/repo` will be provided. The chat will be accessible at this address.

3. When opening the web page, the user enters the service account JSON key, their name, and a shared `Seed` for encryption. After a successful connection, the message history is displayed. To grant access to other users, it is sufficient to share the same JSON key and `Seed`.

## Files

- `frontend/index.html` — main HTML file with two screens (connection and chat).
- `frontend/styles.css` — styles for the connection form and chat window.
- `frontend/crypto.js` — cryptographic functions: PBKDF2/AES-GCM key derivation and Base64 encoding/decoding.
- `frontend/app.js` — application logic: service account authorization, Google Sheets API requests, sending and receiving messages, and UI.
- `README.md` — this document with the project description and security warnings.
- `setup-guide.md` — a detailed step-by-step guide for configuring the service account, spreadsheet, and deployment.

## Conclusion

This web chat demonstrates the concept of a “shared-key private chat” and showcases the use of the Google Sheets API and the Web Crypto API in pure JavaScript. Message encryption is based on PBKDF2 (100,000 iterations) and AES-GCM. Rows are appended to the spreadsheet using the `spreadsheets.values.append` API method, which adds values to the next available row. The JWT structure for the service account includes the required fields `iss`, `scope`, `aud`, `iat`, and `exp`, signed with RS256. Despite the use of encryption, the project does not provide strong security: the service account key is shared among participants, there is no participant authentication, and polling occurs every 10 seconds. Therefore, the system is suitable only for educational or experimental purposes and should not be used with sensitive data.