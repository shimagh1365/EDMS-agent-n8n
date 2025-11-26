const { google } = require('googleapis');
require('dotenv').config();

async function debugSheetNames() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.get({
      spreadsheetId: process.env.USER_DIRECTORY_SHEET_ID
    });

    console.log("===== Sheet Names in USER_DIRECTORY sheet =====");
    res.data.sheets.forEach(s => {
      console.log(`"${s.properties.title}"`);
    });
    console.log("===============================================");
  } catch (err) {
    console.error("Error:", err.message);
  }
}

debugSheetNames();
