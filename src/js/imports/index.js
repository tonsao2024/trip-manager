export async function loadSheetJS() {
  const mod = await import('https://esm.sh/xlsx@0.18.5');
  return mod.default || mod;
}

export async function parseImportFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'json') {
    const text = await file.text();
    return JSON.parse(text);
  }
  if (ext === 'csv') {
    const XLSX = await loadSheetJS();
    const text = await file.text();
    const wb = XLSX.read(text, { type: 'string' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  }
  if (['xlsx', 'xls'].includes(ext)) {
    const XLSX = await loadSheetJS();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  }
  throw new Error('Unsupported file type');
}

export function validateItineraryImportRows(rows) {
  const errors = [];
  const validRows = [];
  const required = ['Date', 'Start Time', 'Place Name'];
  rows.forEach((row, idx) => {
    const rowErrors = [];
    for (const col of required) {
      if (!row[col]) rowErrors.push(`${col} required`);
    }
    if (row['Coordinates']) {
      const parts = String(row['Coordinates']).split(',').map(s => s.trim());
      if (parts.length !== 2) rowErrors.push('Coordinates must be lat,lng');
    }
    if (rowErrors.length) errors.push({ row: idx + 2, errors: rowErrors, data: row });
    else validRows.push(row);
  });
  return { validRows, errors };
}

export function transformImportRowsToItems(rows, tripId) {
  // Map template columns to itinerary item
  return rows.map((row, idx) => ({
    title: row['Place Name'],
    description: row['Description'] || '',
    date: row['Date'], // Expect YYYY-MM-DD
    startAt: new Date(`${row['Date']}T${row['Start Time'] || '09:00'}`),
    durationMinutes: parseInt(row['Duration'] || '60', 10),
    travelToNextMinutes: parseInt(row['Travel Time'] || '0', 10),
    coordinates: row['Coordinates'] || '',
    googleMapsUrl: row['Google Maps URL'] || '',
    imageUrl: row['Image URL'] || '',
    category: row['Category'] || 'general',
    notes: row['Notes'] || '',
    order: idx,
    status: 'planned'
  }));
}

export async function downloadTemplate(format = 'csv') {
  const headers = ['Date','Start Time','Place Name','Description','Duration','Travel Time','Coordinates','Google Maps URL','Image URL','Category','Notes'];
  const sample = [
    ['2027-01-17','09:00','Fujisan Station','Start point','60','15','35.3606,138.7274','https://maps.google.com/?q=35.3606,138.7274','','transport',''],
    ['2027-01-17','10:15','Lake Kawaguchi','Photo spot','90','10','35.4961,138.7688','','','','sightseeing','Bring camera']
  ];
  if (format === 'json') {
    const json = sample.map(r => {
      const obj = {};
      headers.forEach((h,i) => obj[h] = r[i]);
      return obj;
    });
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    triggerDownload(blob, 'itinerary_template.json');
  } else {
    const XLSX = await loadSheetJS();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    if (format === 'xlsx') {
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      triggerDownload(new Blob([out], { type: 'application/octet-stream' }), 'itinerary_template.xlsx');
    } else {
      const csv = XLSX.utils.sheet_to_csv(ws);
      triggerDownload(new Blob([csv], { type: 'text/csv' }), 'itinerary_template.csv');
    }
  }
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
