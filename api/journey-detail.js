import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Missing id parameter' });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // Helper: turn rows into objects
    function rowsToObjects(rows) {
      if (!rows || rows.length < 2) return [];
      const headers = rows[0].map(h => (h || '').trim());
      return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header] = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
        });
        return obj;
      });
    }

    // Fetch all four tabs in parallel
    const [journeysRes, itineraryRes, hotelsRes, highlightsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Journeys!A:S' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Itinerary!A:K' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Hotels!A:N' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: 'Highlights!A:E' }),
    ]);

    const allJourneys = rowsToObjects(journeysRes.data.values);
    const journey = allJourneys.find(j => j['Journey ID'] === id);

    if (!journey) {
      return res.status(404).json({ error: 'Journey not found' });
    }

    // Normalise Types
    journey.TypesArray = journey.Types
      ? journey.Types.split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const itinerary = rowsToObjects(itineraryRes.data.values)
      .filter(row => row['Journey ID'] === id)
      .sort((a, b) => Number(a['Day Number']) - Number(b['Day Number']));

    const hotels = rowsToObjects(hotelsRes.data.values)
      .filter(row => row['Journey ID'] === id)
      .map(h => ({
        ...h,
        PricePerNight: parseFloat(h['Price Per Night']) || 0,
        IsDefault: String(h['Is Default']).toUpperCase() === 'TRUE',
        SortOrder: parseInt(h['Sort Order']) || 99,
      }))
      .sort((a, b) => a.SortOrder - b.SortOrder);

    const highlights = rowsToObjects(highlightsRes.data.values)
      .filter(row => row['Journey ID'] === id)
      .sort((a, b) => (parseInt(a['Sort Order']) || 99) - (parseInt(b['Sort Order']) || 99));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json({
      journey,
      itinerary,
      hotels,
      highlights,
    });

  } catch (error) {
    console.error('journey-detail error:', error);
    return res.status(500).json({
      error: 'Failed to fetch journey detail',
      details: error.message,
    });
  }
}