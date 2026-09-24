import { google } from 'googleapis';

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // --- Auth ---
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;

    // --- Read the whole Journeys tab ---
    // Assumes header row is row 1
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Journeys!A:Q', // adjust if you add more columns later
    });

    const rows = response.data.values;
    if (!rows || rows.length < 2) {
      return res.status(200).json([]);
    }

    const headers = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1);

    // --- Helper: turn a row into a clean object ---
    function rowToJourney(row) {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] ? row[i].trim() : '';
      });

      // Normalise Types into an array
      obj.TypesArray = obj.Types
        ? obj.Types.split(',').map(t => t.trim()).filter(Boolean)
        : [];

      return obj;
    }

    let journeys = dataRows.map(rowToJourney);

    // --- Apply filters from query params ---
    const { continent, country, city, type } = req.query;

    if (continent) {
      journeys = journeys.filter(j => 
        j.Continent.toLowerCase() === continent.toLowerCase()
      );
    }

    if (country) {
      journeys = journeys.filter(j => 
        j.Country.toLowerCase() === country.toLowerCase()
      );
    }

    if (city) {
      journeys = journeys.filter(j => 
        j.City.toLowerCase() === city.toLowerCase()
      );
    }

    // Multi-select Types → OR logic
    if (type) {
      // Support both ?type=Beach&type=Romantic  and  ?type=Beach,Romantic
      const requestedTypes = Array.isArray(type)
        ? type
        : type.split(',').map(t => t.trim());

      journeys = journeys.filter(j =>
        requestedTypes.some(t =>
          j.TypesArray.some(jt => jt.toLowerCase() === t.toLowerCase())
        )
      );
    }

    // --- Default: return only the top 7 rows when no filters ---
    const hasAnyFilter = continent || country || city || type;
    if (!hasAnyFilter) {
      journeys = journeys.slice(0, 7);
    }

    // --- Optional: light caching (60 seconds) ---
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');

    return res.status(200).json(journeys);

  } catch (error) {
    console.error('Journeys API error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch journeys',
      details: error.message 
    });
  }
}