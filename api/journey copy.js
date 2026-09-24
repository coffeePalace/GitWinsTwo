const { google } = require("googleapis");

module.exports = async (req, res) => {
  try {
    // Only allow GET requests
    if (req.method !== "GET") {
      return res.status(405).json({
        error: "Method not allowed"
      });
    }

    // Get Journey ID from URL
    const journeyId = String(req.query.journeyId || "")
      .trim()
      .toUpperCase();

    if (!journeyId) {
      return res.status(400).json({
        error: "Missing journeyId"
      });
    }

    // Basic validation
    if (!/^MW\d+$/.test(journeyId)) {
      return res.status(400).json({
        error: "Invalid journey ID"
      });
    }

    // Check required environment variables
    if (!process.env.GOOGLE_SHEET_ID) {
      return res.status(500).json({
        error: "GOOGLE_SHEET_ID is not configured"
      });
    }

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      return res.status(500).json({
        error: "GOOGLE_SERVICE_ACCOUNT_JSON is not configured"
      });
    }

    // Read service account credentials from Vercel
    const credentials = JSON.parse(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    );

    // Authenticate with Google
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        "https://www.googleapis.com/auth/spreadsheets.readonly"
      ]
    });

    const sheets = google.sheets({
      version: "v4",
      auth
    });

    // Read the Journeys sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Journeys!A:Q"
    });

    const rows = response.data.values || [];

    if (rows.length === 0) {
      return res.status(404).json({
        error: "No journey data found"
      });
    }

    // First row contains column headers
    const headers = rows[0];

    // Find requested journey
    const journeyRow = rows
      .slice(1)
      .find((row) => {
        return String(row[0] || "")
          .trim()
          .toUpperCase() === journeyId;
      });

    if (!journeyRow) {
      return res.status(404).json({
        error: `Journey ${journeyId} not found`
      });
    }

    // Convert row into an object using the headers
    const journey = {};

    headers.forEach((header, index) => {
      journey[header] = journeyRow[index] || "";
    });

    // Return journey data
    return res.status(200).json(journey);

  } catch (error) {
    console.error("Journey API error:", error);

    return res.status(500).json({
      error: "Unable to retrieve journey data"
    });
  }
};