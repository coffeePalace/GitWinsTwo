import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method not allowed');
  }

  const { slug } = req.query;

  if (!slug) {
    return res.status(400).send('Missing journey slug');
  }

  try {
    // Google Sheets authentication
    const credentials = JSON.parse(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    );

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets.readonly'
      ]
    });

    const sheets = google.sheets({
      version: 'v4',
      auth
    });

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Read Journeys sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Journeys!A:S'
    });

    const rows = response.data.values || [];

    if (rows.length < 2) {
      return res.status(404).send('No journeys found');
    }

    // Convert rows into objects
    const headers = rows[0].map(h => (h || '').trim());

    const journeys = rows.slice(1).map(row => {
      const obj = {};

      headers.forEach((header, index) => {
        obj[header] =
          row[index] !== undefined && row[index] !== null
            ? String(row[index]).trim()
            : '';
      });

      return obj;
    });

    // Find journey by Slug
    const journey = journeys.find(
      j =>
        String(j.Slug || '').trim().toLowerCase() ===
        String(slug).trim().toLowerCase()
    );

    if (!journey) {
      return res.status(404).send('Journey not found');
    }

    const journeyId = journey['Journey ID'];

    if (!journeyId) {
      return res.status(500).send('Journey has no Journey ID');
    }

    // Internally serve the existing itinerary page.
    // Browser URL remains /your-slug
    const destination =
      `/itinerary.html?id=${encodeURIComponent(journeyId)}`;

    return res.redirect(307, destination);

  } catch (error) {
    console.error('itinerary-slug error:', error);

    return res.status(500).send('Failed to resolve journey URL');
  }
}