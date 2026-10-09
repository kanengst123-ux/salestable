import fetch from 'node-fetch';

async function run() {
  const MASTER_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=687938954&single=true&output=csv";
  const res = await fetch(MASTER_URL);
  const text = await res.text();
  const lines = text.split('\n');
  const headers = lines[0].split(',');
  console.log('Headers count:', headers.length);
  const imgIdx = headers.findIndex(h => h.trim().toLowerCase().includes('image url'));
  console.log('imgIdx:', imgIdx, 'Header:', headers[imgIdx]);

  let count = 0;
  const samples = [];
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.includes('http')) {
      const parts = l.split(',');
      const imgVal = parts[imgIdx];
      if (imgVal && imgVal.startsWith('http')) {
        count++;
        if (samples.length < 5) {
          samples.push({ name: parts[2], img: imgVal, id: parts[1] });
        }
      }
    }
  }
  console.log('Products with direct column image URL:', count);
  console.log('Samples:', JSON.stringify(samples, null, 2));
}
run();
