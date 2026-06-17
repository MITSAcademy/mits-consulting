const url = (process.env.API_BASE_URL || 'http://localhost:4000') + '/api/health';
require('https').get(url, (r) => {
  let d = '';
  r.on('data', (c) => d += c);
  r.on('end', () => {
    try {
      const j = JSON.parse(d);
      if (!j.ok || !j.db) { console.error('Health check failed:', d); process.exit(1); }
      console.log('Health OK — db:', j.db, 'ts:', j.ts);
    } catch (e) { console.error('Bad response:', d); process.exit(1); }
  });
}).on('error', (e) => { console.error(e.message); process.exit(1); });
