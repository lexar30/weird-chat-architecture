/*
 * Main application logic for the web chat client.  This script handles
 * authentication with Google using a service account, encrypts and decrypts
 * messages with the derived symmetric key, performs polling against the
 * Google Sheets API and updates the UI accordingly.
 */

(function () {
  'use strict';

  // Spreadsheet identifier (to be provided by the deployer).  Replace the
  // placeholder string below with your Google Spreadsheet ID.  The ID is the
  // portion of the sheet's URL between "/d/" and "/edit".
  const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
  const SHEET_NAME = 'messages';
  const POLL_INTERVAL_MS = 10000;
  const SPIN_SYMBOLS = ['➉︎', '❤︎', '☮︎', '☆︎'];

  let serviceAccount = null;
  let accessToken = null;
  let encryptionKey = null;
  let authorName = '';
  let lastRowCount = 1; // Header row
  const sentIds = new Set();
  let pollTimer = null;

  /**
   * Convert a PEM‑formatted private key string into a CryptoKey.  The PEM
   * input contains the header and footer lines, which are stripped before
   * decoding.  The resulting key is imported for signing with RSA‑PKCS1 v1.5.
   *
   * @param {string} pem The private key in PEM format.
   * @returns {Promise<CryptoKey>} The imported CryptoKey for signing.
   */
  async function importPrivateKey(pem) {
    const lines = pem.trim().split(/\r?\n/);
    const base64 = lines.filter(l => !l.includes('-----')).join('');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return window.crypto.subtle.importKey(
      'pkcs8',
      bytes.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
  }

  /**
   * Base64URL‑encode a JSON string.  Converts the string to Base64 and then
   * makes it URL safe by replacing characters and removing padding.
   *
   * @param {string} str The JSON string to encode.
   * @returns {string} The Base64URL‑encoded representation.
   */
  function base64urlEncodeString(str) {
    return base64urlEncode(btoa(str));
  }

  /**
   * Base64URL‑encode an ArrayBuffer.  Uses the helper in crypto.js to
   * convert to Base64 then makes it URL safe.
   *
   * @param {ArrayBuffer} buffer The binary data to encode.
   * @returns {string} The Base64URL‑encoded representation.
   */
  function base64urlEncodeBuffer(buffer) {
    return base64urlEncode(arrayBufferToBase64(buffer));
  }

  /**
   * Create a signed JWT for the OAuth 2.0 service account flow.  The claim set
   * includes the issuer (service account email), a space‑delimited list of
   * scopes, the audience set to the token endpoint, and issued/expiration
   * timestamps.  The header indicates the RS256 algorithm.  Signing is
   * performed using the imported private key.
   *
   * @param {Object} svc The parsed service account JSON key.
   * @param {string} scopeScopes Space‑delimited scopes requested.
   * @returns {Promise<string>} The signed JWT ready for transmission.
   */
  async function createJWT(svc, scopeScopes) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: svc.client_email,
      scope: scopeScopes,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    };
    const encodedHeader = base64urlEncodeString(JSON.stringify(header));
    const encodedPayload = base64urlEncodeString(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const key = await importPrivateKey(svc.private_key);
    const signatureBuffer = await window.crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      new TextEncoder().encode(signingInput)
    );
    const encodedSignature = base64urlEncodeBuffer(signatureBuffer);
    return `${signingInput}.${encodedSignature}`;
  }

  /**
   * Request an OAuth 2.0 access token from Google.  The JWT bearer token flow
   * is implemented here.  On success the function resolves with the access
   * token string.  If the response is not 200, an error is thrown.
   *
   * @param {Object} svc The parsed service account key.
   * @returns {Promise<string>} Access token for subsequent API calls.
   */
  async function getAccessTokenFromServiceAccount(svc) {
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive'
    ].join(' ');
    const assertion = await createJWT(svc, scopes);
    const params = new URLSearchParams();
    params.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    params.set('assertion', assertion);
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    if (!res.ok) {
      throw new Error(`Token request failed (${res.status})`);
    }
    const data = await res.json();
    return data.access_token;
  }

  /**
   * Fetch all rows from the messages sheet.  If includeHeader is false the
   * first row (headers) is not returned.  This function does not modify
   * lastRowCount; the caller must update it as appropriate.
   *
   * @returns {Promise<Array>} An array of rows (each a string array).
   */
  async function fetchAllRows() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:D`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
      throw new Error(`Sheet read failed (${res.status})`);
    }
    const data = await res.json();
    return data.values || [];
  }

  /**
   * Append a single message row to the sheet.  The row must be an array of
   * four columns: id, timestamp, ciphertext and version.  On success the
   * Google API returns metadata about the update but we ignore it.  If the
   * response status is not OK an exception is thrown.
   *
   * @param {Array<string>} row The data for a single row.
   */
  async function appendRow(row) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A:D:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const body = { values: [row] };
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(`Append failed (${res.status})`);
    }
  }

  /**
   * Load all existing messages from the sheet and display them in the chat
   * window.  This function decrypts each message using the derived key and
   * adds it to the UI.  It also updates lastRowCount.
   */
  async function loadInitialMessages() {
    const rows = await fetchAllRows();
    // Expect header row at index 0
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const id = row[0];
      const ts = row[1];
      const ciphertext = row[2];
      const version = row[3];
      if (version !== 'v1') {
        continue;
      }
      // Decrypt
      const msg = await decryptPayload(ciphertext, encryptionKey);
      if (msg) {
        addMessageToUI(msg);
        sentIds.add(id);
      }
    }
    lastRowCount = rows.length;
  }

  /**
   * Poll the sheet for new rows and append them to the chat.  Only rows
   * beyond lastRowCount are processed.  This function is called periodically
   * via setInterval().
   */
  async function pollForUpdates() {
    try {
      const rows = await fetchAllRows();
      if (rows.length > lastRowCount) {
        for (let i = lastRowCount; i < rows.length; i++) {
          const row = rows[i];
          const id = row[0];
          const ciphertext = row[2];
          const version = row[3];
          if (version !== 'v1' || sentIds.has(id)) {
            continue;
          }
          const msg = await decryptPayload(ciphertext, encryptionKey);
          if (msg) {
            addMessageToUI(msg);
            sentIds.add(id);
          }
        }
        lastRowCount = rows.length;
      }
    } catch (err) {
      // Display network/API errors in the UI but allow polling to continue.
      showError(err.message);
    }
  }

  /**
   * Add a message object to the message pane in the UI.  The object is
   * expected to have properties author, text, ts and type.  The chat will
   * scroll to the bottom whenever a new message is added.
   *
   * @param {Object} msg The message to display.
   */
  function addMessageToUI(msg) {
    const messagesDiv = document.getElementById('messages');
    const wrapper = document.createElement('div');
    wrapper.className = 'message';
    const authorSpan = document.createElement('span');
    authorSpan.className = 'message-author';
    authorSpan.textContent = `${msg.author}: `;
    const textSpan = document.createElement('span');
    textSpan.className = 'message-text';
    textSpan.textContent = msg.text;
    if (msg.type === 'spin') {
      // Use monospace formatting for slot messages to align symbols
      textSpan.style.fontFamily = 'monospace';
    }
    wrapper.appendChild(authorSpan);
    wrapper.appendChild(textSpan);
    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  /**
   * Display an error message below the input area.  Clears any previous
   * message.  The message will remain until replaced or cleared.
   *
   * @param {string} msg The text to display.
   */
  function showError(msg) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = msg;
  }

  /**
   * Clear any displayed error message.
   */
  function clearError() {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = '';
  }

  /**
   * Perform the connection sequence.  Parses the service account key,
   * derives the encryption key from the seed, obtains an OAuth token and
   * loads existing messages.  On success the chat UI is revealed.  On
   * failure an error is displayed and the connect screen remains visible.
   */
  async function connect() {
    const keyText = document.getElementById('serviceKey').value.trim();
    const name = document.getElementById('userName').value.trim();
    const seed = document.getElementById('seed').value;
    const errorDiv = document.getElementById('connectError');
    errorDiv.textContent = '';
    if (!keyText || !name || !seed) {
      errorDiv.textContent = 'Please provide all fields.';
      return;
    }
    try {
      serviceAccount = JSON.parse(keyText);
    } catch (e) {
      errorDiv.textContent = 'Invalid JSON key.';
      return;
    }
    authorName = name;
    try {
      // Derive symmetric key
      encryptionKey = await deriveKey(seed);
      // Obtain OAuth token
      accessToken = await getAccessTokenFromServiceAccount(serviceAccount);
      // Verify access by reading messages
      await loadInitialMessages();
      // Switch UI
      document.getElementById('connect-screen').classList.add('hidden');
      document.getElementById('chat-screen').classList.remove('hidden');
      // Start polling for new messages
      pollTimer = setInterval(pollForUpdates, POLL_INTERVAL_MS);
    } catch (err) {
      console.error(err);
      errorDiv.textContent = 'Invalid service account key or no table access';
    }
  }

  /**
   * Send a chat message of the specified type.  The message text is trimmed
   * and validated before encryption.  If encryption or network requests
   * throw an error, the error is displayed in the UI.
   *
   * @param {string} text The message text.
   * @param {string} type Either 'text' or 'spin'.
   */
  async function sendChatMessage(text, type) {
    clearError();
    if (!text) {
      return;
    }
    if (text.length > 1000) {
      showError('Message too long (max 1000 characters).');
      return;
    }
    const payload = {
      author: authorName,
      text: text,
      ts: Date.now(),
      type: type
    };
    try {
      const cipher = await encryptPayload(payload, encryptionKey);
      const rowId = crypto.randomUUID();
      // Append to sheet
      await appendRow([rowId, String(payload.ts), cipher, 'v1']);
      // Update UI immediately
      addMessageToUI(payload);
      sentIds.add(rowId);
      lastRowCount += 1;
      // Clear input
      document.getElementById('messageInput').value = '';
    } catch (err) {
      console.error(err);
      showError('Failed to send message.');
    }
  }

  /**
   * Handle the SPIN button logic.  Randomly selects three symbols and formats
   * them into a slot‑style string.  Then sends as a spin message.
   */
  function handleSpin() {
    const pick = () => SPIN_SYMBOLS[Math.floor(Math.random() * SPIN_SYMBOLS.length)];
    const symbols = [pick(), pick(), pick()];
    const slotString = `| ${symbols[0]} | ${symbols[1]} | ${symbols[2]} |`;
    sendChatMessage(slotString, 'spin');
  }

  /**
   * Register event listeners after the DOM has loaded.
   */
  function init() {
    document.getElementById('connectBtn').addEventListener('click', connect);
    document.getElementById('sendBtn').addEventListener('click', () => {
      const text = document.getElementById('messageInput').value.trim();
      sendChatMessage(text, 'text');
    });
    document.getElementById('spinBtn').addEventListener('click', handleSpin);
    document.getElementById('disconnectBtn').addEventListener('click', () => {
      // Reload page to clear state
      location.reload();
    });
    // Allow pressing Enter to send message
    document.getElementById('messageInput').addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        const text = document.getElementById('messageInput').value.trim();
        sendChatMessage(text, 'text');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();