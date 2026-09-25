import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const { slug } = req.query;

  if (!slug) {
    return res.status(400).json({
      error: 'Missing slug parameter'
    });
  }

  try {
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

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Journeys!A:S'
    });

    const rows = response.data.values || [];

    if (rows.length < 2) {
      return res.status(404).json({
        error: 'No journeys found'
      });
    }

    const headers = rows[0].map(
      header => (header || '').trim()
    );

    const journeys = rows.slice(1).map(row => {
      const obj = {};

      headers.forEach((header, index) => {
        obj[header] =
          row[index] !== undefined &&
          row[index] !== null
            ? String(row[index]).trim()
            : '';
      });

      return obj;
    });

    function createSlug(name) {
      return String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    const requestedSlug = String(slug)
      .trim()
      .toLowerCase();

    const journey = journeys.find(j => {
      const generatedSlug = createSlug(
        j['Journey Name']
      );

      return generatedSlug === requestedSlug;
    });

    if (!journey) {
      return res.status(404).json({
        error: 'Journey not found'
      });
    }

    const journeyId = journey['Journey ID'];

    if (!journeyId) {
      return res.status(500).json({
        error: 'Journey has no Journey ID'
      });
    }

    return res.status(200).json({
      id: journeyId,
      slug: createSlug(journey['Journey Name'])
    });

  } catch (error) {
    console.error(
      'itinerary-slug error:',
      error
    );

    return res.status(500).json({
      error: 'Failed to resolve journey slug'
    });
  }
}