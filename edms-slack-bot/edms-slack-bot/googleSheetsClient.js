/* ======================================================
   googleSheetsClient.js
   Safe utility for Google Sheets data access
   ====================================================== */

require("dotenv").config();
const { google } = require("googleapis");

/**
 * Creates authenticated Google Sheets client using service account
 */
function getGoogleSheetsClient() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    return google.sheets({ version: "v4", auth });
  } catch (error) {
    console.error("❌ Failed to initialize Google Sheets client:", error);
    throw error;
  }
}

/**
 * Reads values from a given range in Google Sheets.
 * Returns an array-of-arrays raw values.
 *
 * @param {string} sheetId - The Google Sheet ID
 * @param {string} range - Range in A1 notation (e.g. "Sheet1!A2:F")
 * @returns {Promise<Array<Array<string>>>}
 */
async function getSheetData(sheetId, range) {
  try {
    const sheets = getGoogleSheetsClient();

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range,
    });

    return result.data.values || [];
  } catch (error) {
    console.error(`❌ Error fetching sheet data (range: ${range}):`, error);
    return [];
  }
}

/**
 * Extracts dropdown options from a tab by column name.
 *
 * @param {string} sheetId - The Google Sheet ID
 * @param {string} tab - Tab name (e.g. "DocumentType")
 * @param {string} columnName - Header to look for (e.g. "DocumentType")
 * @returns {Promise<Array<string>>}
 */
async function getDropdownOptions(sheetId, tab, columnName) {
  try {
    const rows = await getSheetData(sheetId, `${tab}!A1:Z`);

    if (!rows || rows.length < 2) {
      console.warn(`⚠️ No data found in tab: ${tab}`);
      return [];
    }

    const header = rows[0];
    const data = rows.slice(1);

    const index = header.findIndex(
      (col) => col && col.trim().toLowerCase() === columnName.trim().toLowerCase()
    );

    if (index === -1) {
      console.warn(`⚠️ Column "${columnName}" not found in tab "${tab}"`);
      return [];
    }

    // extract unique non-empty values
    const values = data
      .map((row) => (row[index] || "").trim())
      .filter((v) => v !== "");

    const unique = [...new Set(values)];

    return unique;
  } catch (error) {
    console.error(
      `❌ Error fetching dropdown options for tab "${tab}", column "${columnName}":`,
      error
    );
    return [];
  }
}

module.exports = {
  getSheetData,
  getDropdownOptions,
};
