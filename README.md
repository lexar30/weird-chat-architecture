⚠️ Experimental / Proof of Concept

This project is a vibe-coded experimental prototype created to test an architectural idea:

Web chat client hosted on GitHub Pages using Google Sheets as encrypted message storage via a Service Account.

It is not a production-ready application.

# Web Chat on GitHub Pages and Google Sheets

## Overview

This project implements a simple web chat in which all messages are stored in Google Sheets. The client side is deployed on GitHub Pages and runs entirely in the browser. A Google service account is used to access the spreadsheet, and message text is encrypted before being written. The architecture consists of three components:

1. **Frontend on GitHub Pages.** A static web page (`index.html`, `app.js`, `crypto.js`) displays two screens: the connection window and the message window itself. The client handles the entire user interface, encryption/decryption using the Web Crypto API, and interaction with Google Sheets via the REST API.
2. **Google Sheets.** A spreadsheet is used as the message storage. A sheet named `messages` is created with columns `id`, `timestamp`, `ciphertext` and `version`. Only encrypted messages are stored in the spreadsheet.
3. **Service account.** The user generates a JSON key file for a service account in the Google Cloud Console. This key is loaded in the browser, where a JWT is signed from it and an OAuth token is requested to access the Sheets API. According to Google, the JWT must contain the required fields `iss`, `scope`, `aud`, `exp` and `iat` and is signed using the RS256 (RSA SHA-256) algorithm【737136471858408†L469-L489】【737136471858408†L556-L566】. The token is then used in requests to Google Sheets.

## How it works

1. The user opens the page on GitHub Pages. A connection form appears with four fields: a multi-line field for the service account JSON key, a `Name` field, a `Spreadsheet ID` field and a `Seed` field (a string that serves as a password). The `Spreadsheet ID` field is intended for entering the identifier of the spreadsheet (the part of the URL between `/d/` and `/edit`).
2. When **CONNECT** is clicked, the client:
   - parses the JSON key and extracts `client_email` and `private_key`;
   - performs a cryptographic derivation: from the entered `Seed` using PBKDF2 (100,000 iterations, SHA-256, salt `"ghpages-chat-v1"`) an AES-GCM key of 256 bits is derived. Such an approach is demonstrated in the MDN example where a password is turned into an AES key using PBKDF2 and then the AES-GCM algorithm is applied【67270886650091†L742-L771】;
   - signs a JWT with the fields `iss`, `scope`, `aud`, `iat` and `exp` (see above) and exchanges it for an OAuth `access_token` via the endpoint `https://oauth2.googleapis.com/token` as described in Google's JWT Bearer flow【737136471858408†L469-L489】;
   - tests access by reading existing messages from the `messages` sheet.
3. After a successful connection the chat window opens. Messages are loaded from Google Sheets using the `spreadsheets.values.get` method. The Google API notes that when adding values with `spreadsheets.values.append` the values will be added to the next row of the sheet starting at the first column, and it is necessary to specify `valueInputOption` and a range【862163037826125†L260-L268】. New messages are written via `append` with parameters `valueInputOption=RAW` and `insertDataOption=INSERT_ROWS`. To work, OAuth scopes `https://www.googleapis.com/auth/drive` or `https://www.googleapis.com/auth/spreadsheets` are required【862163037826125†L373-L379】.
4. The user can send a text message (**SEND**) or run slots (**SPIN**). In the case of `SPIN` the client randomly selects three symbols from the set `➉︎`, `❤︎`, `☮︎`, `☆︎` and forms a string of the form `| ❤︎ | ☆︎ | ☮︎ |`. The message is encrypted and sent as normal.
5. Every 10 seconds Google Sheets is polled for new rows. If new rows are found, the client decrypts the messages and displays them in the chat.

## Security and limitations

**Important:** the service account JSON key and `Seed` input are entered by the user in the browser. The client logic runs completely on the user's side. Because of this, the following limitations must be taken into account:

* The service account JSON key is not stored on the server, but is not actually a secret: anyone who knows the key will get read and write access to the Google Sheets. According to Google's JWT model, the signature is computed in the browser and sent in exchange for a token. Therefore this chat should be considered a closed channel between people who have pre-shared the service key and encryption seed. **The system is unreliable/not intended for sensitive data or commercial use.**
* The application lacks real authorisation: anyone who knows the key can write under any name. There are no user blocking mechanisms.
* Updates occur by polling every 10 seconds, so the chat is not “real time”. Google API quota limits may prevent frequent requests.
* The maximum message length is limited to 1000 characters to prevent abuse of cell length.
* Additional risks are described in the technical specification: there is no protection against duplication except for the message UUID; there are no limits on the number of connections; the service account is not protected; the encryption version is fixed at `v1`.

## Preparing Google Cloud

1. Create a new project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Sheets API** and, if necessary, the **Google Drive API**. These permissions are required to call the `append` method, which, according to the documentation, requires one of the scopes drive, drive.file or spreadsheets【862163037826125†L373-L379】.
3. Create a service account with the “Editor” role for Google Sheets and obtain a JSON key:
   - In **IAM & Admin → Service Accounts** create a new account.
   - Add the **Editor** role or more restrictive if possible.
   - Generate a key in JSON format and download it.
4. Create a Google Sheets spreadsheet (the name can be arbitrary). Add a sheet named `messages` and specify the headers in the first row: `id`, `timestamp`, `ciphertext`, `version`. These columns must appear strictly in this order.
5. In the access settings add the service account email as an editor of the spreadsheet.
6. Save the spreadsheet identifier (the part of the URL between `/d/` and `/edit`). When connecting to the chat it will need to be entered in the `Spreadsheet ID` field.

## Deploying on GitHub Pages

1. Create a new repository on GitHub. The project tree should look like this:

```
project-root/
├── index.html
├── app.js
├── crypto.js
├── styles.css
├── README.md
└── setup-guide.md
```

2. Commit and push the repository. In the GitHub repository settings go to the **Pages** section and choose to publish from the `main` branch (or another if you use one). After activation you will receive a public URL of the form `https://username.github.io/repo`. The chat will be available at this address.

3. Opening the web page, the user enters the service account JSON key, their name, the spreadsheet identifier (the `Spreadsheet ID` field) and the shared encryption `Seed`. With a successful connection, the message history is displayed. To give others access simply share the same JSON key, spreadsheet identifier and `Seed`.

## Files

- `index.html` — the main HTML file with two screens (connection and chat).
- `styles.css` — styles for the connection form and chat window.
- `crypto.js` — cryptographic functions: deriving a key via PBKDF2/AES-GCM and Base64 encoding/decoding.
- `app.js` — application logic: authorisation via service account, requests to the Google Sheets API, sending and receiving messages, UI.
- `README.md` — this document describing the project and security warnings.
- `setup-guide.md` — a detailed step-by-step guide for configuring the service account, spreadsheet and deployment.

## Output

This web chat implements the idea of “a closed chat using a shared key” and demonstrates working with the Google Sheets API and Web Crypto API in pure JavaScript. The encryption methods are based on MDN recommendations: using PBKDF2 with 100,000 iterations and AES-GCM to encrypt messages【67270886650091†L742-L771】. Rows are added to the spreadsheet using the `spreadsheets.values.append` API, which appends values to the next row of the sheet【862163037826125†L260-L268】. The structure of the JWT for the service account conforms to Google's requirements: fields `iss`, `scope`, `aud`, `iat`, `exp` and an RS256 signature【737136471858408†L469-L489】【737136471858408†L556-L566】. Despite the use of encryption, the project does not provide full security: the service account key is available to all chat participants, there is no verification of participants' authenticity, and polling is performed every 10 seconds. Therefore the system is suitable only for educational purposes and is not recommended for use with sensitive data.
