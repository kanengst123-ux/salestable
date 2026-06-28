async function run() {
  try {
    const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?output=csv&gid=0';
    const res = await fetch(url);
    const data = await res.text();
    
    function parseCSVLine(line) {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current);
      return result;
    }

    const lines = data.split('\n');
    console.log("All unique Col E and F mappings:");
    const mappings = {};
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (row.length > 5) {
        const symbol = row[4] ? row[4].trim() : '';
        const catName = row[5] ? row[5].trim() : '';
        if (symbol && catName) {
          mappings[symbol] = catName;
        }
      }
    }
    console.log(JSON.stringify(mappings, null, 2));

    // Let's count products with each category symbol
    const catCounts = {};
    for (let i = 1; i < lines.length; i++) {
      const row = parseCSVLine(lines[i]);
      if (row.length > 1) {
        const catSymbol = row[1] ? row[1].trim() : '';
        if (catSymbol) {
          catCounts[catSymbol] = (catCounts[catSymbol] || 0) + 1;
        }
      }
    }
    console.log("Product counts per category symbol (Col B):", catCounts);

  } catch (err) {
    console.error(err);
  }
}

run();
