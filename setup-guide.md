# Setup Guide

This document describes the sequence of actions for deploying the web chat on GitHub Pages and preparing the Google Sheets spreadsheet. The instructions are intended for a developer who wants to reproduce the functionality of the project.

## 1. Creating a project in Google Cloud

1. Go to [Google Cloud Console](https://console.cloud.google.com/), create a new project and select it.
2. In **APIs & Services → Library** find and enable **Google Sheets API**. The append method will also require access to the Drive API, so enable **Google Drive API**. According to Google documentation, the `spreadsheets.values.append` method requires one of the scopes drive, drive.file or spreadsheets【862163037826125†L373-L379】.
3. In **IAM & Admin → Service Accounts** create a service account. Set a name and the role `Editor` (or another that allows reading and writing to spreadsheets). Click “Create and continue”; after the account is created add the role and finish the process. Save the generated account email — it will be needed for spreadsheet access.
4. Generate a key: open the created service account, go to **Keys → Add key → Create new key**, select JSON format and download the file. This file contains the `client_email` and `private_key` fields that will be used in the browser to sign the JWT.

## 2. Preparing Google Sheets

1. Create a new spreadsheet in Google Sheets. The name can be any.
2. Add a sheet named `messages` (if it's not there) and in the first row specify the headers in strict order: `id`, `timestamp`, `ciphertext`, `version`. These names are important because the client code assumes exactly this structure.
3. Open the spreadsheet's access settings and add the service account email as an editor (**Editor**). Without this, access to the spreadsheet via API will be denied and the chat will not load.
4. Copy the spreadsheet identifier (the part of the URL between `/d/` and `/edit`). This ID will be required when connecting to the chat — it must be entered into the `Spreadsheet ID` field on the connection form.

## 3. Setting up the repository and GitHub Pages

1. Create a repository on GitHub. The project structure should include a `frontend` folder with the files `index.html`, `styles.css`, `app.js`, `crypto.js`, and one level up the files `README.md` and `setup-guide.md`.
2. Commit all the files and push them to the remote repository.
3. In the repository settings open **Settings → Pages** (formerly known as **GitHub Pages**). Select the deployment source: the `main` branch (or another) and the `/frontend` folder. Save the settings. After some time GitHub will publish the site at `https://your_username.github.io/repository_name/`.
4. If necessary configure a custom domain through the GitHub Pages features.

## 4. Using the chat

1. Open the URL provided by GitHub Pages. The page will display a connection form.
2. Paste the contents of the JSON file that was downloaded when creating the service account into the **Service Account Key (JSON)** field. Make sure that the JSON structure is preserved correctly.
3. Enter an arbitrary name in the **Name** field — it will be displayed as the author of messages.
4. Enter the spreadsheet identifier in the **Spreadsheet ID** field. This is the part of the URL of your Google Sheets between `/d/` and `/edit`. All participants must use the same ID.
5. Enter a string in the **Seed** field. This is the shared encryption key. All chat participants must use the same seed to decrypt messages. A recommended length is from 10 characters; use a sufficiently complex combination.
6. Click **CONNECT**. On a successful connection existing messages from the spreadsheet will be loaded and the chat window will open. In case of an error check the correctness of the JSON key, the spreadsheet permissions and the spreadsheet identifier.
7. To send a message enter text (up to 1000 characters) and click **SEND** or press Enter. To send slots click **SPIN** — three symbols will be selected randomly and sent as a “spin” message.
8. During the session every 10 seconds the spreadsheet will be polled. New rows will be decrypted and displayed.

## 5. Technical details

* **Encryption.** The client uses the browser's `SubtleCrypto` API. The AES-GCM (256-bit) key is derived from the seed using PBKDF2 (100,000 iterations, salt `"ghpages-chat-v1"`, SHA-256). This approach is described in the MDN guide on `deriveKey()`【67270886650091†L742-L771】.
* **JWT and OAuth.** To obtain the token a JWT is signed based on the fields `iss`, `scope`, `aud`, `iat`, `exp` using the RS256 algorithm. Details are provided in Google's documentation for service accounts【737136471858408†L469-L489】【737136471858408†L556-L566】.
* **Google Sheets API.** Messages are written using the `spreadsheets.values.append` method, which adds rows to the end of the sheet and requires the `valueInputOption` and `insertDataOption` parameters【862163037826125†L260-L268】. Messages are read using the `spreadsheets.values.get` method.
* **Limitations.** The chat operates on a polling principle (polling once every 10 seconds), so there may be a delay between sending and receiving. There is no protection by IP or user accounts — anyone who has the JSON key and seed can access. **Do not use this chat for confidential data**.

## 6. Troubleshooting

- **Error “Invalid service account key or no table access” when connecting.** Check that the JSON key is valid, the spreadsheet is created and the service account has rights to modify the spreadsheet.
- **Messages are not loading.** Make sure that the sheet is named `messages` and that the headers in the first row are `id`, `timestamp`, `ciphertext`, `version`.
- **Unable to decrypt messages.** Participants must use the same `Seed`. If the seed differs, messages will appear undecodable (decryption error).
- **API quotas.** If the Google API quota is exceeded the append method may return a 429 error. Limit the frequency of messages or increase the quota in Google Cloud.

## Conclusion

This guide describes the steps to set up the web chat on GitHub Pages using Google Sheets as the backend and a service account. Despite the use of encryption and authorisation, this chat does not provide a complete level of security because the service account key is entered on the client side and can be used by any participant. The project is intended for experiments and demonstration of Google API capabilities, not for transmitting sensitive data.
