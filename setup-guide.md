# Setup Guide

This document describes the sequence of steps required to deploy the web chat on GitHub Pages and prepare the Google Sheets table. The instructions are intended for a developer who wants to reproduce the project’s functionality.

## 1. Creating a Project in Google Cloud

1. Go to the Google Cloud Console, create a new project, and select it.
2. In the menu **APIs & Services → Library**, find and enable the **Google Sheets API**. The append method also requires access to the Drive API, so enable the **Google Drive API** as well.
3. Open **IAM & Admin → Service Accounts** and create a service account. Set a name and assign the `Editor` role (or another role that allows reading and writing to spreadsheets). Click “Create and continue”, add the role after the account is created, and finish the process. Save the generated service account email — it will be needed to grant access to the spreadsheet.
4. Generate a key: open the created service account, go to the **Keys → Add key → Create new key** tab, choose the JSON format, and download the file. This file contains the `client_email` and `private_key` fields that will be used in the browser to sign the JWT.

## 2. Preparing Google Sheets

1. Create a new spreadsheet in Google Sheets. The name can be arbitrary.
2. Add a sheet named `messages` (if it does not exist) and specify the headers in the first row in strict order: `id`, `timestamp`, `ciphertext`, `version`. These names are important because the client code expects this exact structure.
3. Open the spreadsheet sharing settings and add the service account email as an editor (**Editor**). Without this, API access to the table will be denied and the chat will not load.
4. Copy the spreadsheet ID (the part of the URL between `/d/` and `/edit`). This ID must be inserted into the file `frontend/app.js` instead of the string `YOUR_SPREADSHEET_ID_HERE`.

## 3. Repository Setup and GitHub Pages

1. Create a repository on GitHub. The project structure should include the `frontend` folder with the files `index.html`, `styles.css`, `app.js`, and `crypto.js`, and at the root level the files `README.md` and `setup-guide.md`.
2. Commit all files and push them to the remote repository.
3. In the repository settings, open **Settings → Pages** (previously called **GitHub Pages**). Select the deployment source: the `main` branch (or another branch if used) and the `/frontend` folder. Save the settings. After a short time, GitHub will publish the site at a URL like `https://your_username.github.io/repository_name/`.
4. If needed, configure a custom domain using GitHub Pages features.

## 4. Using the Chat

1. Open the URL provided by GitHub Pages. The page will display a connection form.
2. In the **Service Account Key (JSON)** field, paste the contents of the JSON file downloaded during service account creation. Make sure the JSON structure remains valid.
3. Enter any name in the **Name** field — it will be displayed as the message author.
4. Enter a string in the **Seed** field. This is the shared encryption key. All chat participants must use the same seed to decrypt messages. A recommended length is at least 10 characters; use a sufficiently complex combination.
5. Click **CONNECT**. If the connection is successful, existing messages will be loaded from the spreadsheet and the chat window will open. In case of an error, check the JSON key, spreadsheet permissions, and spreadsheet ID.
6. To send a message, enter text (up to 1000 characters) and press **SEND** or the Enter key. To send slots, press **SPIN** — three symbols will be randomly selected and sent as a “spin” message.
7. During the session, the spreadsheet is polled every 10 seconds. New rows will be decrypted and displayed automatically.

## 5. Technical Details

- **Encryption.** The client uses the browser’s `SubtleCrypto` API. A 256-bit AES-GCM key is derived from the seed using PBKDF2 (100,000 iterations, salt `"ghpages-chat-v1"`, SHA-256).
- **JWT and OAuth.** An OAuth token is obtained by signing a JWT containing the fields `iss`, `scope`, `aud`, `iat`, and `exp` with the RS256 algorithm, and exchanging it via the OAuth token endpoint for service accounts.
- **Google Sheets API.** Messages are written using the `spreadsheets.values.append` method, which appends rows to the end of the table and requires the `valueInputOption` and `insertDataOption` parameters. Messages are read using the `spreadsheets.values.get` method.
- **Limitations.** The chat operates using polling (checking for updates every 10 seconds), so delays between sending and receiving are possible. There is no IP or account-based protection — anyone with the JSON key and seed can access the chat. Do not use this chat for confidential data.

## 6. Troubleshooting

- **Error “Invalid service account key or no table access” on connection.** Ensure the JSON key is valid, the spreadsheet exists, and the service account has edit permissions for the spreadsheet.
- **Messages are not loading.** Verify that the sheet is named `messages` and that the first-row headers are exactly: `id`, `timestamp`, `ciphertext`, `version`.
- **Unable to decrypt messages.** All participants must use the same `Seed`. If the seed differs, messages will appear undecodable (decryption error).
- **API quotas.** If Google API quotas are exceeded, the append method may return a 429 error. Reduce message frequency or increase quotas in Google Cloud.

## Conclusion

This guide describes the steps required to configure and deploy the web chat on GitHub Pages using Google Sheets as a backend and a service account for access. Despite the use of encryption and OAuth-based access, the chat does not provide full security, since the service account key is entered on the client side and can be used by any participant. The project is intended for experimentation and demonstration of Google API capabilities, not for transmitting sensitive data.