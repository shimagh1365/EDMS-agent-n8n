// testGoogleSheets.js
require("dotenv").config();
const { getSheetData } = require("./googleSheetsClient");

(async () => {
  const data = await getSheetData("Sheet1!A1:F5");
  console.log(data);
})();