
import { SaleRecord, SalesAnalytics, SalesData, Product, Customer, SavedOrder, OrderItem } from '../types';
import { getCachedItem, setCachedItem } from './cacheService';

const DEFAULT_SHEET_ID = '10gGU4ZZH_qUKwYklfIK0sQFNCUCfUc36C3SpkfUoQlA';
export const UPDATE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxJBpLD4XstIGc_47V4ys3WYr_OX5vfsc36u5aEIsAyv06wYDWT_FFuAooQVMt1Pq8R/exec';

export const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 8000
): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(id);
  }
};

const getExportUrl = (id: string) => {
  const sheetId = id.includes('docs.google.com') 
    ? id.match(/[-\w]{25,}/)?.[0] || id 
    : id;
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
};

export const parseCSV = (text: string): string[][] => {
  const result: string[][] = [];
  let row: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentField.trim());
        currentField = '';
      } else if (char === '\n' || char === '\r') {
        row.push(currentField.trim());
        if (row.length > 0) {
          result.push(row);
        }
        row = [];
        currentField = '';
        if (char === '\r' && nextChar === '\n') i++;
      } else {
        currentField += char;
      }
    }
  }

  if (currentField !== '' || row.length > 0) {
    row.push(currentField.trim());
    if (row.some(cell => cell.length > 0)) {
      result.push(row);
    }
  }

  return result;
};

const findColumn = (headers: (string | undefined)[], keywords: string[]): number => {
  const normalizedHeaders = headers.map(h => h?.toLowerCase().trim() || '');
  for (const keyword of keywords) {
    const kw = keyword.toLowerCase().trim();
    const idx = normalizedHeaders.findIndex(h => h.includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
};

const parseNum = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = val.toString().replace(/[$,\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

export const DEFAULT_CUSTOMERS: Customer[] = [
  { name: 'TechFlow Solutions', grade: 'A', district: '九龍東', sales: 'EVA' },
  { name: 'Sarah Jenkins', grade: 'B', district: '港島', sales: 'KATIE' },
  { name: 'Urban Outfitters', grade: 'A', district: '新界東', sales: 'YO' },
  { name: 'BuildIt Inc', grade: 'B', district: '九龍西', sales: 'KASEY' },
  { name: 'Global Logistics', grade: 'A', district: '港島', sales: 'EVA' },
  { name: 'Mike Ross', grade: 'C', district: '新界西', sales: 'KATIE' },
  { name: 'Aura Design', grade: 'B', district: '九龍東', sales: 'YO' },
  { name: 'Zenith Corp', grade: 'A', district: '港島', sales: 'KASEY' },
  { name: 'City Library', grade: 'C', district: '新界東', sales: 'EVA' },
  { name: 'Coffee House', grade: 'B', district: '九龍西', sales: 'KATIE' },
  { name: '落鋪', grade: 'A', district: '九龍東', sales: 'Admin' },
  { name: 'HKTVMALL', grade: 'A', district: '九龍東', sales: 'Admin' },
  { name: '其他', grade: 'A', district: '九龍東', sales: 'Admin' }
];

export const DEFAULT_PRODUCTS: Product[] = [
  { id: 'PROD-001', name: 'MacBook Pro 14"', price: 2499, prices: { A: 2200, B: 2350, C: 2499 }, unlimitedStock: true, stock: 100 },
  { id: 'PROD-002', name: 'Dell XPS 15', price: 1899, prices: { A: 1650, B: 1750, C: 1899 }, unlimitedStock: true, stock: 50 },
  { id: 'PROD-003', name: 'ThinkPad X1', price: 1599, prices: { A: 1400, B: 1500, C: 1599 }, unlimitedStock: true, stock: 40 },
  { id: 'PROD-004', name: '4K Studio Display', price: 1299, prices: { A: 1100, B: 1200, C: 1299 }, unlimitedStock: true, stock: 30 },
  { id: 'PROD-005', name: 'Pro Tablet 11', price: 799, prices: { A: 700, B: 750, C: 799 }, unlimitedStock: true, stock: 25 },
  { id: 'PROD-006', name: 'Wireless Keyboard', price: 99, prices: { A: 80, B: 90, C: 99 }, unlimitedStock: true, stock: 200 },
  { id: 'PROD-007', name: '2TB External SSD', price: 199, prices: { A: 160, B: 180, C: 199 }, unlimitedStock: true, stock: 150 },
  { id: 'PROD-008', name: 'Router AX6000', price: 299, prices: { A: 250, B: 275, C: 299 }, unlimitedStock: true, stock: 60 },
  { id: 'PROD-009', name: 'ErgoDesk Chair', price: 350, prices: { A: 280, B: 315, C: 350 }, unlimitedStock: true, stock: 80 },
  { id: 'PROD-010', name: 'Oak Writing Desk', price: 850, prices: { A: 720, B: 780, C: 850 }, unlimitedStock: true, stock: 20 },
  { id: 'PROD-011', name: 'Metal Bookcase', price: 450, prices: { A: 380, B: 410, C: 450 }, unlimitedStock: true, stock: 35 },
  { id: 'PROD-012', name: 'Floor Lamp', price: 120, prices: { A: 95, B: 110, C: 120 }, unlimitedStock: true, stock: 90 },
  { id: 'PROD-013', name: 'Gaming Throne', price: 499, prices: { A: 420, B: 460, C: 499 }, unlimitedStock: true, stock: 15 },
  { id: 'PROD-014', name: 'Bean Bags', price: 80, prices: { A: 65, B: 72, C: 80 }, unlimitedStock: true, stock: 100 },
  { id: 'PROD-015', name: 'Heavy Duty Drill', price: 180, prices: { A: 145, B: 160, C: 180 }, unlimitedStock: true, stock: 75 },
  { id: 'PROD-016', name: 'Bulk Coffee Beans', price: 250, prices: { A: 200, B: 225, C: 250 }, unlimitedStock: true, stock: 300 },
  { id: 'PROD-017', name: 'Summer Collection Bulk', price: 1200, prices: { A: 1000, B: 1100, C: 1200 }, unlimitedStock: true, stock: 50 },
  { id: 'PROD-018', name: 'Leather Belts', price: 45, prices: { A: 35, B: 40, C: 45 }, unlimitedStock: true, stock: 500 },
  { id: 'PROD-019', name: 'Helmet Pack', price: 300, prices: { A: 240, B: 270, C: 300 }, unlimitedStock: true, stock: 40 }
];

export const fetchCustomerGrades = async (): Promise<Customer[]> => {
  const parseCustomersCSV = (text: string): Customer[] => {
    const rows = parseCSV(text);
    if (rows.length >= 2) {
      return rows.slice(1).map(row => ({
        name: row[0] || '',
        sales: row[1] || '',
        grade: (row[2] || 'C') as 'A' | 'B' | 'C',
        district: row[3] || ''
      })).filter(c => c.name.trim() !== '');
    }
    return [];
  };

  const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=1793390915&single=true&output=csv';

  // 1. Fetch published CDN CSV with short 4s timeout (typically responds in ~150ms)
  let csvCustomers: Customer[] = [];
  try {
    const res = await fetchWithTimeout(CSV_URL + `&t=${Date.now()}`, { method: 'GET' }, 4000);
    if (res.ok) {
      const text = await res.text();
      csvCustomers = parseCustomersCSV(text);
    }
  } catch (err) {
    console.warn('Customer published CSV fetch timed out or failed:', err);
  }

  // 2. Try live Google Apps Script with 3.5s timeout for any newly added customers
  if (UPDATE_SCRIPT_URL && UPDATE_SCRIPT_URL.startsWith('https://')) {
    try {
      const liveUrl = `${UPDATE_SCRIPT_URL}?action=getCustomers&t=${Date.now()}`;
      const res = await fetchWithTimeout(liveUrl, { method: 'GET' }, 3500);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          const liveCustomers = json.map((item: any) => ({
            name: item.name || '',
            sales: item.sales || item.user || '',
            grade: (item.grade || 'C') as 'A' | 'B' | 'C',
            district: item.district || ''
          })).filter((c: Customer) => c.name.trim() !== '');
          if (liveCustomers.length > 0) {
            setCachedItem('customers', liveCustomers);
            return liveCustomers;
          }
        }
      }
    } catch (liveErr) {
      console.warn('Live GAS getCustomers timed out or unavailable, using published CSV:', liveErr);
    }
  }

  if (csvCustomers.length > 0) {
    setCachedItem('customers', csvCustomers);
    return csvCustomers;
  }

  // 3. Fallback to cached customers from previous session
  try {
    const cached = await getCachedItem<Customer[]>('customers');
    if (cached && cached.length > 0) {
      return cached;
    }
  } catch (e) {
    console.warn('Unable to read cached customers:', e);
  }

  return DEFAULT_CUSTOMERS;
};

export const fetchSalesData = async (customId?: string): Promise<{ data: SalesData; source: 'cloud' | 'local' }> => {
  const targetId = customId || DEFAULT_SHEET_ID;
  const DATA_URL = getExportUrl(targetId);

  try {
    const response = await fetchWithTimeout(DATA_URL, {}, 8000);
    if (!response.ok) throw new Error('Cloud fetch failed');

    const text = await response.text();
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error('Empty dataset');

    const resultData = processRows(rows);
    setCachedItem('sales_data', resultData);
    return { data: resultData, source: 'cloud' };
  } catch (error) {
    console.warn('Cloud sync timed out or failed, checking cache and local data:', error);
    
    // Check client-side persistent cache
    try {
      const cached = await getCachedItem<SalesData>('sales_data');
      if (cached && cached.records && cached.records.length > 0) {
        console.log('Using cached sales data from previous sync');
        return { data: cached, source: 'local' };
      }
    } catch (cacheErr) {
      console.warn('Cache lookup failed:', cacheErr);
    }

    try {
      const localResponse = await fetchWithTimeout('./data.csv', {}, 5000);
      if (!localResponse.ok) throw new Error('Local fallback failed');
      const localText = await localResponse.text();
      const localRows = parseCSV(localText);
      const localData = processRows(localRows);
      return { data: localData, source: 'local' };
    } catch (localError) {
      throw new Error('No data source available.');
    }
  }
};

const processRows = (rows: string[][]): SalesData => {
  const headers = rows[0];
  const cleanHeaders = headers.filter(h => h && h.trim());

  const MAP = {
    item: 1,        // B
    quantity: 3,    // D
    unit: 4,        // E
    ref: 5,         // F
    price: 6,       // G
    customer: 7,    // H
    subtotal: 9,    // J
    user: 10,       // K
    invoice: 11,    // L
    paid: 12,       // M
    remark: 13,     // N
    countCol: 17,   // R
    colS: 18        // S
  };

  const idx = {
    orderId: findColumn(headers, ['orderid', 'id', 'ref', 'invoice']),
    orderDate: findColumn(headers, ['orderdate', 'date']),
    customerName: findColumn(headers, ['customer', 'user']),
    sales: findColumn(headers, ['sales', 'total']),
    quantity: findColumn(headers, ['quantity', 'qty']),
    profit: findColumn(headers, ['profit']),
  };

  const dataRows = rows.slice(1).filter(row => {
    const id = (row[idx.orderId] || '').toString().trim();
    const customer = (row[MAP.customer] || row[idx.customerName] || '').toString().trim();
    return id !== '' || customer !== '';
  });

  const records: SaleRecord[] = dataRows.map((row, rowIdx) => {
    const record: any = {};
    headers.forEach((h, i) => {
      if (h && h.trim()) record[h] = row[i] || '';
    });

    const getRaw = (colIndex: number) => {
      if (colIndex < 0 || colIndex >= row.length) return '';
      return (row[colIndex] || '').toString().trim();
    };
    
    const recordSubtotal = parseNum(getRaw(MAP.subtotal));

    return {
      ...record,
      orderId: getRaw(idx.orderId) || `REF-${rowIdx + 1}`,
      orderDate: getRaw(idx.orderDate) || new Date().toISOString(),
      customerName: getRaw(MAP.customer) || getRaw(idx.customerName) || 'Unknown',
      userName: getRaw(MAP.user) || 'Unknown',
      segment: record.segment || 'Standard',
      region: record.region || 'General',
      category: record.category || 'Products',
      subCategory: record.subCategory || '',
      productName: getRaw(MAP.item) || record.productName || 'Standard Item',
      sales: parseNum(getRaw(idx.sales)) || recordSubtotal,
      quantity: parseInt(getRaw(MAP.quantity).replace(/[^0-9]/g, '')) || parseInt(getRaw(idx.quantity).replace(/[^0-9]/g, '')) || 0,
      profit: parseNum(getRaw(idx.profit)) || recordSubtotal * 0.15,
      subtotal: recordSubtotal,
      paidStatus: getRaw(MAP.paid),
      paidDate: getRaw(MAP.paid),
      colSValue: getRaw(MAP.colS),
      countValue: parseNum(getRaw(MAP.countCol)),
      unit: getRaw(MAP.unit),
      price: parseNum(getRaw(MAP.price)),
      invoiceNo: getRaw(MAP.invoice),
      colM: getRaw(MAP.paid),
      remark: getRaw(MAP.remark)
    };
  });

  return { records, headers: cleanHeaders };
};

const normalizeUser = (name: string): string | null => {
  const n = name.trim().toLowerCase();
  if (n === 'eva') return 'Eva';
  if (n === 'yo') return 'Yo';
  if (n === 'katie') return 'Katie';
  if (n === 'kasey') return 'Kasey';
  return null;
};

export const calculateAnalytics = (data: SaleRecord[]): SalesAnalytics => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const analytics: SalesAnalytics = {
    totalSales: 0,
    totalProfit: 0,
    totalOrders: data.length,
    averageOrderValue: 0,
    salesByCategory: {},
    salesByRegion: {},
    salesByMonth: {},
    salesByDay: {},
    userSalesPastWeek: { 'Eva': 0, 'Yo': 0, 'Katie': 0, 'Kasey': 0 },
    userSalesPast30Days: { 'Eva': 0, 'Yo': 0, 'Katie': 0, 'Kasey': 0 },
  };

  data.forEach(item => {
    analytics.totalSales += item.sales;
    analytics.totalProfit += item.profit;
    
    if (item.category) {
      analytics.salesByCategory[item.category] = (analytics.salesByCategory[item.category] || 0) + item.sales;
    }
    if (item.region) {
      analytics.salesByRegion[item.region] = (analytics.salesByRegion[item.region] || 0) + item.sales;
    }
    
    const date = new Date(item.orderDate);
    if (!isNaN(date.getTime()) && date.getFullYear() > 1900) {
      const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      analytics.salesByMonth[monthYear] = (analytics.salesByMonth[monthYear] || 0) + item.sales;
      
      const dayKey = date.toISOString().split('T')[0];
      analytics.salesByDay[dayKey] = (analytics.salesByDay[dayKey] || 0) + item.subtotal;

      // Calculate User Performance for Eva, Yo, Katie, Kasey
      const normalized = normalizeUser(item.userName);
      if (normalized) {
        if (date >= sevenDaysAgo) {
          analytics.userSalesPastWeek[normalized] = (analytics.userSalesPastWeek[normalized] || 0) + item.subtotal;
        }
        if (date >= thirtyDaysAgo) {
          analytics.userSalesPast30Days[normalized] = (analytics.userSalesPast30Days[normalized] || 0) + item.subtotal;
        }
      }
    }
  });

  analytics.averageOrderValue = analytics.totalOrders > 0 ? analytics.totalSales / analytics.totalOrders : 0;
  return analytics;
};

export const SHEET15_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=1813720414&single=true&output=csv';
export const SHEET15_GVIZ_URL = 'https://docs.google.com/spreadsheets/d/16yXbnBdkKuKCVGvhrUJ7YPFNVGBcyap3b5sbvqv0Dsg/gviz/tq?tqx=out:csv&sheet=Sheet15';

/**
 * Format any product ID strictly into the canonical standard format: id-<digits>
 * e.g. "4910530585034752" -> "id-4910530585034752"
 *      "id-4910530585034752" -> "id-4910530585034752"
 */
export const formatProductId = (id: string | number | undefined | null): string => {
  if (id === undefined || id === null) return '';
  const str = String(id).trim();
  if (!str) return '';
  const numOnly = str.replace(/^id-/, '').trim();
  return numOnly ? `id-${numOnly}` : str;
};

export const PRODUCT_IMAGE_DEV_BASE_URL = 'https://ais-dev-e67qvrm3vxclidkmxocymu-259187692597.us-east1.run.app';
export const PRODUCT_IMAGE_PRE_BASE_URL = 'https://ais-pre-e67qvrm3vxclidkmxocymu-259187692597.us-east1.run.app';
export const PRODUCT_IMAGE_SERVICE_BASE_URL = PRODUCT_IMAGE_DEV_BASE_URL;

export const getCanonicalProductImageUrl = (id: string | number | undefined | null): string => {
  const formattedId = formatProductId(id);
  if (!formattedId) return '';
  return `${PRODUCT_IMAGE_SERVICE_BASE_URL}/api/products/${formattedId}/image`;
};

let cachedSheetIdMap: { idMap: Map<string, string>; timestamp: number } | null = null;

// Fetch Sheet15 mapping strictly by Product ID (Col A -> Col D)
export const fetchSheetImageMapById = async (): Promise<Map<string, string>> => {
  const now = Date.now();
  if (cachedSheetIdMap && (now - cachedSheetIdMap.timestamp) < 10 * 60 * 1000) {
    return cachedSheetIdMap.idMap;
  }

  const parseSheetCSV = (text: string) => {
    const rows = parseCSV(text);
    const idMap = new Map<string, string>();
    if (rows.length === 0) return idMap;

    let pidIdx = 0; // Col A is Product ID
    let imgIdx = 3; // Col D is Image URLs

    if (rows.length > 0) {
      const headers = rows[0].map(h => (h || '').trim().toLowerCase());
      const foundPid = headers.findIndex(h => h.replace(/[\s_-]/g, '') === 'productid' || h === 'id');
      if (foundPid !== -1) pidIdx = foundPid;
      const foundImg = headers.findIndex(h => h === 'image urls' || h === 'image url' || h === 'image');
      if (foundImg !== -1) imgIdx = foundImg;
    }

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawPid = (row[pidIdx] || '').trim();
      const rawImg = (row[imgIdx] || '').trim();
      const match = rawImg.match(/https?:\/\/[^\s,"'>|]+/);
      if (rawPid && match) {
        const formattedId = formatProductId(rawPid);
        idMap.set(formattedId, match[0]);
        idMap.set(rawPid, match[0]);
        idMap.set(rawPid.replace(/^id-/, ''), match[0]);
      }
    }
    return idMap;
  };

  try {
    const res = await fetchWithTimeout(SHEET15_CSV_URL + `&t=${Date.now()}`, { method: 'GET' }, 4000);
    if (res.ok) {
      const text = await res.text();
      const idMap = parseSheetCSV(text);
      cachedSheetIdMap = { idMap, timestamp: now };
      return idMap;
    }
  } catch (e) {
    console.warn('Primary Sheet15 CSV fetch failed, trying GVIZ:', e);
  }

  try {
    const res = await fetchWithTimeout(SHEET15_GVIZ_URL + `&t=${Date.now()}`, { method: 'GET' }, 4000);
    if (res.ok) {
      const text = await res.text();
      const idMap = parseSheetCSV(text);
      cachedSheetIdMap = { idMap, timestamp: now };
      return idMap;
    }
  } catch (e) {
    console.warn('GVIZ Sheet15 CSV fetch failed:', e);
  }

  return new Map<string, string>();
};

// Fetch authoritative product names, IDs, and image endpoints
export const fetchAuthorityProducts = async (): Promise<Map<string, { id: string; name: string; rawImageUrl?: string }>> => {
  const authorityMap = new Map<string, { id: string; name: string; rawImageUrl?: string }>();
  
  // Try remote authority endpoints first, fallback to local server endpoint
  const endpoints = [
    `${PRODUCT_IMAGE_DEV_BASE_URL}/api/products`,
    `${PRODUCT_IMAGE_PRE_BASE_URL}/api/products`,
    '/api/products'
  ];

  for (const url of endpoints) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET' }, 3500);
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data?.products) ? data.products : (Array.isArray(data) ? data : []);
        if (list.length > 0) {
          for (const item of list) {
            const rawId = item.id || '';
            const formattedId = formatProductId(rawId);
            const name = (item.name || '').trim();
            const rawImageUrl = item.extraAttributes?.['Image URLs'] || item.imageUrl || '';
            if (formattedId) {
              authorityMap.set(formattedId, { id: formattedId, name, rawImageUrl });
              authorityMap.set(rawId, { id: formattedId, name, rawImageUrl });
            }
          }
          if (authorityMap.size > 0) {
            break;
          }
        }
      }
    } catch {}
  }
  return authorityMap;
};

export const fetchProducts = async (customId?: string): Promise<Product[]> => {
  const MASTER_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=687938954&single=true&output=csv';

  // Helper to parse the full published master CSV in a single pass with strict Product ID matching
  const parseMasterCSV = (
    text: string,
    sheetIdMap: Map<string, string>,
    authorityMap: Map<string, { id: string; name: string; rawImageUrl?: string }>
  ): Product[] => {
    const rows = parseCSV(text);
    if (rows.length === 0) return [];

    let headerRowIdx = 0;
    let titleIdx = 2; // Col C is Title
    let productIdIdx = 1; // Col B is Product ID
    let goldIdx = 17; // Col R
    let silverIdx = 18; // Col S
    let basicIdx = 19; // Col T
    let priceIdx = 14; // Col O
    let discountedPriceIdx = 15; // Col P
    let unlimitedStockIdx = 27; // Col AB
    let stockIdx = 28; // Col AC
    let listIdx = 31; // Col AF (header: list)
    let imageUrlsIdx = 38; // Col AM (header: Image URLs)
    let categoriesIdx = 12; // Col M (header: Categories)

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const idx = rows[i].findIndex(cell => cell && cell.toLowerCase().trim() === 'title');
      if (idx !== -1) {
        headerRowIdx = i;
        titleIdx = idx;
        const pIdIdx = rows[i].findIndex(cell => {
          const cellStr = (cell || '').toLowerCase().trim();
          return cellStr.replace(/[\s_-]/g, '').includes('productid') || cellStr === 'id';
        });
        if (pIdIdx !== -1) productIdIdx = pIdIdx;
        const cIdx = rows[i].findIndex(cell => {
          const cellStr = (cell || '').toLowerCase().trim();
          return cellStr === 'categories' || cellStr === 'category' || cellStr.includes('分類') || cellStr.includes('類別');
        });
        if (cIdx !== -1) categoriesIdx = cIdx;
        const imgIdx = rows[i].findIndex(cell => {
          const cellStr = (cell || '').toLowerCase().trim();
          return cellStr === 'image urls' || cellStr === 'image url' || cellStr === 'image';
        });
        if (imgIdx !== -1) imageUrlsIdx = imgIdx;
        const rIdx = rows[i].findIndex(cell => cell && cell.toLowerCase().includes('gold'));
        if (rIdx !== -1) goldIdx = rIdx;
        const sIdx = rows[i].findIndex(cell => cell && cell.toLowerCase().includes('silver'));
        if (sIdx !== -1) silverIdx = sIdx;
        const tIdx = rows[i].findIndex(cell => cell && cell.toLowerCase().includes('basic'));
        if (tIdx !== -1) basicIdx = tIdx;
        const pIdx = rows[i].findIndex(cell => cell && cell.toLowerCase().trim() === 'price');
        if (pIdx !== -1) priceIdx = pIdx;
        const dpIdx = rows[i].findIndex(cell => cell && cell.toLowerCase().trim() === 'discounted price');
        if (dpIdx !== -1) discountedPriceIdx = dpIdx;
        const uIdx = rows[i].findIndex(cell => cell && cell.toLowerCase().replace(/[\s_-]/g, '').includes('unlimitedstock'));
        if (uIdx !== -1) unlimitedStockIdx = uIdx;
        const stIdx = rows[i].findIndex(cell => cell && (cell.toLowerCase().trim() === 'stock' || cell.includes('庫存')));
        if (stIdx !== -1) stockIdx = stIdx;
        const lIdx = rows[i].findIndex(cell => cell && cell.toLowerCase().trim() === 'list');
        if (lIdx !== -1) listIdx = lIdx;
        break;
      }
    }

    const productMap = new Map<string, Product>();
    rows.slice(headerRowIdx + 1).forEach(row => {
      const rawName = row[titleIdx];
      if (rawName && rawName.trim()) {
        const trimmed = rawName.trim();
        if (trimmed.toLowerCase() === 'title') return;

        const getPrice = (idx: number) => {
          const val = row[idx];
          if (val && val.trim() !== '') return parseNum(val);
          const discounted = row[discountedPriceIdx];
          if (discounted && discounted.trim() !== '') return parseNum(discounted);
          return parseNum(row[priceIdx]);
        };

        const isUnlimited = row[unlimitedStockIdx]?.toString().trim() === '1';
        // Col B (header 'Product ID' of 'raw' tab) is the definitive Product ID
        const rawProdId = row[productIdIdx]?.toString().trim() || '';
        const formattedId = formatProductId(rawProdId);

        let stockVal: number | undefined = undefined;
        if (row[stockIdx] !== undefined && row[stockIdx] !== null && row[stockIdx].toString().trim() !== '') {
          stockVal = parseNum(row[stockIdx]);
        }
        const listVal = row[listIdx] !== undefined && row[listIdx] !== null ? row[listIdx].toString().trim() : '';

        // UNIQUE ID MATCHING - strictly by product ID
        // Canonical image endpoint: https://ais-pre-e67qvrm3vxclidkmxocymu-259187692597.us-east1.run.app/api/products/{formattedId}/image
        const canonicalImgUrl = formattedId
          ? `${PRODUCT_IMAGE_SERVICE_BASE_URL}/api/products/${formattedId}/image`
          : '';

        // Direct raw image URL resolution (STRICTLY by Product ID, never row index)
        let directImg = '';
        if (formattedId && authorityMap.has(formattedId)) {
          directImg = authorityMap.get(formattedId)?.rawImageUrl || '';
        }
        if (!directImg && formattedId && sheetIdMap.has(formattedId)) {
          directImg = sheetIdMap.get(formattedId)!;
        }
        if (!directImg && rawProdId && sheetIdMap.has(rawProdId)) {
          directImg = sheetIdMap.get(rawProdId)!;
        }

        // Secondary fallback to Col AM of 'raw' tab for this specific product row
        if (!directImg) {
          const rawImgField = imageUrlsIdx !== -1 && row[imageUrlsIdx] ? row[imageUrlsIdx].toString().trim() : '';
          const rawImgMatch = rawImgField.match(/https?:\/\/[^\s,"'>|]+/);
          if (rawImgMatch) {
            directImg = rawImgMatch[0];
          } else if (rawImgField) {
            directImg = rawImgField.split('|')[0].trim();
          } else if (row[10]) {
            const optMatch = row[10].toString().trim().match(/https?:\/\/[^\s,"'>|]+/);
            if (optMatch) directImg = optMatch[0];
          }
        }

        const categoriesVal = (row[categoriesIdx] || row[12] || '').toString().trim();

        if (trimmed.length > 1 && !productMap.has(trimmed)) {
          productMap.set(trimmed, {
            id: formattedId || rawProdId,
            name: trimmed,
            price: getPrice(priceIdx),
            prices: {
              A: getPrice(goldIdx),
              B: getPrice(silverIdx),
              C: getPrice(basicIdx)
            },
            unlimitedStock: isUnlimited,
            stock: stockVal,
            list: listVal,
            imageUrl: canonicalImgUrl || undefined,
            rawImageUrl: directImg || undefined,
            category: categoriesVal,
            categories: categoriesVal
          });
        }
      }
    });

    return Array.from(productMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  // 1. Fetch published CDN master CSV, authoritative products, and Sheet ID map concurrently
  let csvProducts: Product[] = [];
  let sheetIdMap = new Map<string, string>();
  let authorityMap = new Map<string, { id: string; name: string; rawImageUrl?: string }>();

  try {
    const [rawRes, s15Res, authRes] = await Promise.allSettled([
      fetchWithTimeout(MASTER_URL + `&t=${Date.now()}`, { method: 'GET' }, 12000),
      fetchSheetImageMapById(),
      fetchAuthorityProducts()
    ]);

    if (s15Res.status === 'fulfilled') {
      sheetIdMap = s15Res.value;
    }
    if (authRes.status === 'fulfilled') {
      authorityMap = authRes.value;
    }

    if (rawRes.status === 'fulfilled' && rawRes.value.ok) {
      const text = await rawRes.value.text();
      csvProducts = parseMasterCSV(text, sheetIdMap, authorityMap);
    }
  } catch (csvError) {
    console.warn('Published master product CSV fetch failed or timed out:', csvError);
  }

  // 2. Quick check against GAS with 12s timeout for freshly added products and live stock
  if (UPDATE_SCRIPT_URL && UPDATE_SCRIPT_URL.startsWith('https://')) {
    try {
      const liveUrl = `${UPDATE_SCRIPT_URL}?action=getProducts&t=${Date.now()}`;
      const res = await fetchWithTimeout(liveUrl, { method: 'GET' }, 12000);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && json.length > 0) {
          const csvMap = new Map(csvProducts.map(p => [p.name, p]));
          const liveProducts: Product[] = json.map((p: any) => {
            const csvData = csvMap.get(p.name);
            const numPrice = parseNum(p.price);
            const priceA = p.priceA !== undefined && p.priceA !== '' ? parseNum(p.priceA) : (p.prices?.A !== undefined ? parseNum(p.prices.A) : (csvData?.prices?.A ?? numPrice));
            const priceB = p.priceB !== undefined && p.priceB !== '' ? parseNum(p.priceB) : (p.prices?.B !== undefined ? parseNum(p.prices.B) : (csvData?.prices?.B ?? numPrice));
            const priceC = p.priceC !== undefined && p.priceC !== '' ? parseNum(p.priceC) : (p.prices?.C !== undefined ? parseNum(p.prices.C) : (csvData?.prices?.C ?? numPrice));
            const resolvedId = formatProductId((p.id && !p.id.startsWith('row-')) ? p.id : (csvData ? csvData.id : p.id));
            const canonicalImg = resolvedId ? `${PRODUCT_IMAGE_SERVICE_BASE_URL}/api/products/${resolvedId}/image` : undefined;
            const resolvedRawImg = p.rawImageUrl || (csvData ? csvData.rawImageUrl : undefined) || (resolvedId ? sheetIdMap.get(resolvedId) : undefined);
            
            const rawCatFromGAS = (p.category && String(p.category).trim()) || (p.categories && String(p.categories).trim());
            const rawCatFromAllValues = Array.isArray(p.allValues) && p.allValues.length > 12 && p.allValues[12] ? String(p.allValues[12]).trim() : '';
            const rawCatFromCSV = csvData ? (csvData.category || csvData.categories || '') : '';
            const rawCatFromExtra = (p.extraAttributes && p.extraAttributes.Categories && p.extraAttributes.Categories !== 'Google Sheet Sync') ? String(p.extraAttributes.Categories).trim() : '';
            const catVal = rawCatFromGAS || rawCatFromAllValues || rawCatFromCSV || rawCatFromExtra || '';

            return {
              ...p,
              id: resolvedId,
              price: numPrice,
              prices: { A: priceA, B: priceB, C: priceC },
              unlimitedStock: p.unlimitedStock !== undefined ? p.unlimitedStock : (csvData ? csvData.unlimitedStock : false),
              stock: p.stock !== undefined ? p.stock : (csvData ? csvData.stock : undefined),
              list: p.list !== undefined && p.list !== null ? String(p.list).trim() : (csvData ? csvData.list : undefined),
              imageUrl: canonicalImg || csvData?.imageUrl,
              rawImageUrl: resolvedRawImg,
              category: catVal,
              categories: catVal,
              allValues: Array.isArray(p.allValues) ? p.allValues : csvData?.allValues
            };
          });

          // Ensure any products from CSV that weren't in GAS are included
          csvProducts.forEach(p => {
            if (!liveProducts.some(lp => lp.name === p.name)) {
              liveProducts.push(p);
            }
          });

          const sortedLive = liveProducts.sort((a, b) => a.name.localeCompare(b.name));
          setCachedItem('products', sortedLive);
          return sortedLive;
        }
      }
    } catch (liveError) {
      console.warn('Live GAS getProducts timed out or unavailable, using published master CSV products:', liveError);
    }
  }

  if (csvProducts.length > 0) {
    setCachedItem('products', csvProducts);
    return csvProducts;
  }

  // 3. Fallback to client cache
  try {
    const cached = await getCachedItem<Product[]>('products');
    if (cached && cached.length > 0 && cached.some(p => p.category || p.categories || (p.allValues && p.allValues[12]))) {
      return cached;
    }
  } catch (e) {
    console.warn('Unable to read cached products:', e);
  }

  return DEFAULT_PRODUCTS;
};

export const getProductImageUrl = (product: { id?: string; imageUrl?: string; rawImageUrl?: string }): { primary: string; fallback: string } => {
  const formattedId = formatProductId(product.id);
  const primary = formattedId
    ? `${PRODUCT_IMAGE_SERVICE_BASE_URL}/api/products/${formattedId}/image`
    : (product.imageUrl || '');
  const fallback = formattedId
    ? `/api/products/${encodeURIComponent(formattedId)}/image`
    : (product.rawImageUrl || '');
  return { primary, fallback };
};

export const addCustomerToSheet = async (name: string, user: string, district: string, grade: 'A' | 'B' | 'C'): Promise<boolean> => {
  try {
    // Title case the user (EVA -> Eva, etc.)
    const formattedUser = user.charAt(0).toUpperCase() + user.slice(1).toLowerCase();
    const payload = {
      action: 'addCustomer',
      name,
      user: formattedUser,
      district,
      grade
    };
    await fetch(UPDATE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (error) {
    console.error('Error adding customer:', error);
    return false;
  }
};

export const addProductToSheet = async (name: string, username: string): Promise<{ success: boolean; id?: string }> => {
  try {
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ddmmyyyyhhmmss = `${dd}${mm}${yyyy}${hh}${min}${ss}`;
    const generatedId = `${username}${ddmmyyyyhhmmss}`;

    const payload = {
      action: 'addProduct',
      name,
      username,
      id: generatedId,
      list: '0'
    };
    await fetch(UPDATE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { success: true, id: generatedId };
  } catch (error) {
    console.error('Error adding product:', error);
    return { success: false };
  }
};

export interface WriteTradeLogOptions {
  skipStockDeduction?: boolean;
  deltaRowsToDeduct?: any[][];
  deltaRowsToReplenish?: any[][];
}

export const writeTradeLogToSheet = async (
  rows: any[][], 
  targetSheet: string = 'Trade_Log',
  options?: WriteTradeLogOptions
): Promise<boolean> => {
  try {
    const payload = {
      action: 'writeTradeLog',
      rows,
      targetSheet,
      isAdmin: targetSheet === 'Trade_log_admin',
      skipStockDeduction: Boolean(options?.skipStockDeduction),
      deductStock: !options?.skipStockDeduction,
      deltaRowsToDeduct: options?.deltaRowsToDeduct || [],
      deltaRowsToReplenish: options?.deltaRowsToReplenish || []
    };
    await fetch(UPDATE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return true;
  } catch (error) {
    console.error('Error writing trade log:', error);
    return false;
  }
};

export const deleteOrderFromSheet = async (orderId: string, rows?: any[][]): Promise<boolean> => {
  try {
    const basePayload: any = {
      orderId,
      orderIds: [orderId],
      replenishStock: true
    };
    if (rows && rows.length > 0) {
      basePayload.rows = rows;
    }
    // 1. Send revertTradeLog (matches user's Google Apps Script action #5)
    await fetch(UPDATE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, action: 'revertTradeLog' })
    });
    // 2. Also send deleteOrder (matches google-apps-script.js template)
    await fetch(UPDATE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, action: 'deleteOrder' })
    });
    return true;
  } catch (error) {
    console.error('Error deleting order:', error);
    return false;
  }
};

/**
 * Removes an order's trade log rows from Google Sheet ('Trade_log' or 'Trade_log_admin')
 * without replenishing/changing stock levels in 'raw' (the goods stay reserved on hold).
 */
export const removeOrderFromSheetKeepStock = async (orderId: string): Promise<boolean> => {
  try {
    const basePayload = {
      orderId,
      orderIds: [orderId],
      skipStockReplenish: true,
      keepStock: true,
      replenishStock: false,
      // Provide dummy row with length < 6 so any deployed version will not replenish stock
      rows: [['SKIP_STOCK_REPLENISH']]
    };
    // 1. Send revertTradeLog
    await fetch(UPDATE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, action: 'revertTradeLog' })
    });
    // 2. Send deleteOrder
    await fetch(UPDATE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...basePayload, action: 'deleteOrder' })
    });
    return true;
  } catch (error) {
    console.error('Error removing order from sheet while keeping stock:', error);
    return false;
  }
};

export const PRODUCT_LIST_SHEET_ID = '16yXbnBdkKuKCVGvhrUJ7YPFNVGBcyap3b5sbvqv0Dsg';
export const TRADE_LOG_GID = '1412322886';
export const TRADE_LOG_ADMIN_GID = '2071438386';

export const TRADE_LOG_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${PRODUCT_LIST_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${TRADE_LOG_GID}`;
export const TRADE_LOG_ADMIN_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${PRODUCT_LIST_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${TRADE_LOG_ADMIN_GID}`;

export const TRADE_LOG_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=1412322886&single=true&output=csv';
export const TRADE_LOG_ADMIN_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=2071438386&single=true&output=csv';

export const purgeDeletedOrdersFromCache = async (deletedIds: string[]): Promise<void> => {
  if (!deletedIds || deletedIds.length === 0) return;
  const set = new Set(deletedIds);
  try {
    const cached = await getCachedItem<SavedOrder[]>('cloud_trade_orders');
    if (cached && Array.isArray(cached)) {
      const filtered = cached.filter(o => o && o.id && !set.has(o.id));
      await setCachedItem('cloud_trade_orders', filtered);
    }
  } catch (e) {
    console.warn('Error purging deleted orders from cache:', e);
  }
};

/**
 * Fetches orders exclusively from the 'Trade_log' tab (regular sales reps)
 * and 'Trade_log_admin' tab (admin user) of the 'Product_list' Google Sheet.
 * The Google Sheet tab 'Log' contains raw historical transaction logs and has
 * NOTHING to do with '訂單列表'.
 */
export const fetchCloudTradeLogOrders = async (): Promise<SavedOrder[]> => {
  let localDeletedSet = new Set<string>();
  try {
    const stored = localStorage.getItem('ws_deleted_order_ids');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) parsed.forEach(id => localDeletedSet.add(id));
    }
  } catch {}

  // 1. First priority: try our dedicated backend API which queries Product_list in real-time
  try {
    const apiRes = await fetchWithTimeout('/api/trade-orders', { method: 'GET' }, 4000);
    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json && json.success && Array.isArray(json.orders)) {
        if (Array.isArray(json.deletedOrderIds)) {
          json.deletedOrderIds.forEach((id: string) => localDeletedSet.add(id));
          localStorage.setItem('ws_deleted_order_ids', JSON.stringify(Array.from(localDeletedSet)));
        }
        const filtered = json.orders.filter((o: any) => o && o.id && !localDeletedSet.has(o.id));
        setCachedItem('cloud_trade_orders', filtered);
        return filtered;
      }
    }
  } catch (apiErr) {
    // Continue to direct Google Sheets fetch fallback
  }

  return fetchCloudTradeLogOrdersFallback();
};

export const parseTradeLogRows = (csvText: string, defaultSales: string): SavedOrder[] => {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return [];

  const headerRow = rows[0].map(h => (h || '').toLowerCase().trim());
  
  let dateCol = headerRow.findIndex(h => h.includes('date') || h.includes('日期'));
  if (dateCol === -1) dateCol = 0;

  let itemCol = headerRow.findIndex(h => h === 'item' || h.includes('貨品') || h.includes('product'));
  if (itemCol === -1) itemCol = 1;

  let qtyCol = headerRow.findIndex(h => h.includes('quantity') || h === 'qty' || h.includes('數量'));
  if (qtyCol === -1) qtyCol = 3;

  let unitCol = headerRow.findIndex(h => h === 'unit' || h.includes('單位'));
  if (unitCol === -1) unitCol = 4;

  let refCol = headerRow.findIndex(h => h === 'ref');
  if (refCol === -1) refCol = 5;

  let priceCol = headerRow.findIndex(h => h === 'price' || h.includes('單價'));
  if (priceCol === -1) priceCol = 6;

  let customerCol = headerRow.findIndex(h => h.includes('customer') || h.includes('客戶'));
  if (customerCol === -1) customerCol = 7;

  let subtotalCol = headerRow.findIndex(h => h.includes('subtotal') || h.includes('小計'));
  if (subtotalCol === -1) subtotalCol = 9;

  let userCol = headerRow.findIndex(h => h === 'user' || h.includes('sales') || h.includes('用戶'));
  if (userCol === -1) userCol = 10;

  // Col 12 is 'ID' (Order ID like EVA00039), Col 2 is 'id' (product ID)
  let idCol = 12;
  if (headerRow[12] && (headerRow[12] === 'id' || headerRow[12].includes('order'))) {
    idCol = 12;
  } else {
    const found = headerRow.findIndex((h, i) => i > 2 && (h === 'id' || h.includes('order')));
    if (found !== -1) idCol = found;
  }

  let remarkCol = headerRow.findIndex(h => h.includes('remark') || h.includes('備註'));
  if (remarkCol === -1) remarkCol = 13;

  const orderMap = new Map<string, SavedOrder>();

  for (let rIdx = 1; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    if (!row || row.length === 0) continue;

    const orderId = (row[idCol] || row[12] || '').trim();
    const customer = (row[customerCol] || row[7] || '').trim();
    if (!orderId && !customer) continue;

    const finalId = orderId || `TRADE-${rIdx}`;
    const sales = (row[userCol] || row[10] || defaultSales || '').trim();
    const date = (row[dateCol] || row[0] || '').trim();
    const remark = (row[remarkCol] || row[13] || '').trim();

    const rawQty = parseNum(row[qtyCol] || row[3]);
    const unit = (row[unitCol] || row[4] || 'unit').trim();
    const ref = parseNum(row[refCol] || row[5]) || 1;
    const price = parseNum(row[priceCol] || row[6]);
    const subtotal = parseNum(row[subtotalCol] || row[9]) || (rawQty * price);

    const isOuterBox = unit.toLowerCase() === 'box' || unit.includes('箱') || unit.includes('盒') || unit.includes('條');
    const totalUnits = isOuterBox && ref > 1 ? (rawQty * ref) : (rawQty || (price > 0 ? Math.round(subtotal / price) : 1));

    const itemName = (row[itemCol] || row[1] || 'Item').trim();

    const orderItem: OrderItem = {
      id: `${finalId}-item-${rIdx}`,
      name: itemName,
      quantity: totalUnits,
      price,
      isOuterBox,
      unitsPerBox: ref,
      outerBoxUnit: unit
    };

    if (!orderMap.has(finalId)) {
      orderMap.set(finalId, {
        id: finalId,
        customerName: customer,
        salesName: sales,
        date,
        remark: remark === '.' ? '' : remark,
        items: [orderItem],
        orderAmount: subtotal,
        isKeyedIn: true,
        isHeld: false,
        stockDeducted: true,
        deductedItems: [{ name: orderItem.name, quantity: orderItem.quantity }]
      });
    } else {
      const existing = orderMap.get(finalId)!;
      existing.items.push(orderItem);
      if (!existing.deductedItems) existing.deductedItems = [];
      existing.deductedItems.push({ name: orderItem.name, quantity: orderItem.quantity });
      existing.orderAmount += subtotal;
      if (!existing.remark && remark && remark !== '.') {
        existing.remark = remark;
      }
    }
  }

  return Array.from(orderMap.values());
};

const fetchCloudTradeLogOrdersFallback = async (): Promise<SavedOrder[]> => {
  let localDeletedSet = new Set<string>();
  try {
    const stored = localStorage.getItem('ws_deleted_order_ids');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) parsed.forEach(id => localDeletedSet.add(id));
    }
  } catch {}

  const fetchCsvText = async (gvizUrl: string, pubUrl: string): Promise<string> => {
    try {
      const gvizWithTime = gvizUrl.includes('?') ? `${gvizUrl}&t=${Date.now()}` : `${gvizUrl}?t=${Date.now()}`;
      const res1 = await fetchWithTimeout(gvizWithTime, { method: 'GET' }, 4000);
      if (res1.ok) {
        const txt = await res1.text();
        if (txt.length > 50) return txt;
      }
    } catch {}
    try {
      const res2 = await fetchWithTimeout(`${pubUrl}&t=${Date.now()}`, { method: 'GET' }, 4000);
      if (res2.ok) return await res2.text();
    } catch {}
    return '';
  };

  try {
    const [regularCsv, adminCsv] = await Promise.all([
      fetchCsvText(TRADE_LOG_GVIZ_URL, TRADE_LOG_CSV_URL),
      fetchCsvText(TRADE_LOG_ADMIN_GVIZ_URL, TRADE_LOG_ADMIN_CSV_URL)
    ]);

    const regularOrders = regularCsv ? parseTradeLogRows(regularCsv, 'Sales') : [];
    const adminOrders = adminCsv ? parseTradeLogRows(adminCsv, 'Admin') : [];
    const combined = [...regularOrders, ...adminOrders].filter(o => o && o.id && !localDeletedSet.has(o.id));

    if (combined.length > 0) {
      setCachedItem('cloud_trade_orders', combined);
      return combined;
    }
  } catch (err) {
    console.warn('Error fetching cloud Trade_log and Trade_log_admin orders:', err);
  }

  // Fallback to cache
  try {
    const cached = await getCachedItem<SavedOrder[]>('cloud_trade_orders');
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached.filter(o => o && o.id && !localDeletedSet.has(o.id));
    }
  } catch (e) {}

  return [];
};

/**
 * Strictly loads all the info in the 'Trade_log' tab of the Google Sheet only.
 * Completely ignores 'Trade_log_admin', local drafts, unkeyed orders, and held orders.
 */
export const fetchStrictTradeLogOrders = async (): Promise<SavedOrder[]> => {
  // 1. First priority: try backend endpoint that strictly fetches Trade_log
  try {
    const apiRes = await fetchWithTimeout(`/api/trade-log-only?t=${Date.now()}`, { method: 'GET' }, 5000);
    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json && json.success && Array.isArray(json.orders)) {
        return json.orders;
      }
    }
  } catch {}

  const gvizUrl = `${TRADE_LOG_GVIZ_URL}&t=${Date.now()}`;
  const pubUrl = `${TRADE_LOG_CSV_URL}&t=${Date.now()}`;

  // 2. Direct GVIZ fetch
  try {
    const res1 = await fetchWithTimeout(gvizUrl, { method: 'GET' }, 5000);
    if (res1.ok) {
      const txt = await res1.text();
      if (txt.length > 50) return parseTradeLogRows(txt, 'Sales');
    }
  } catch {}

  // 3. Direct Published CSV fetch
  try {
    const res2 = await fetchWithTimeout(pubUrl, { method: 'GET' }, 5000);
    if (res2.ok) {
      const txt = await res2.text();
      if (txt.length > 50) return parseTradeLogRows(txt, 'Sales');
    }
  } catch {}

  return [];
};

/**
 * Reconstructs individual SavedOrder objects from raw Trade_Log sales records.
 * Retained for backwards compatibility if needed.
 */
export const extractOrdersFromSalesRecords = (records: SaleRecord[]): SavedOrder[] => {
  const orderMap = new Map<string, SavedOrder>();

  for (let idx = 0; idx < records.length; idx++) {
    const r = records[idx];
    const customer = (r.customerName || '').trim();
    if (!customer || customer === 'Unknown') continue;

    // Check if Col M (paidStatus/colM/orderId) has an app-generated order ID
    const rawColM = (r.colM || r.paidStatus || r.orderId || r['Paid'] || '').toString().trim();
    const isAppOrderId = /^(EVA|YO|KATIE|KASEY|ADMIN|ORDER-)/i.test(rawColM);

    const inv = (r.invoiceNo || r['invoice_no'] || '').toString().trim();

    let key = '';
    if (isAppOrderId) {
      key = rawColM;
    } else if (inv && inv !== '..') {
      key = inv;
    } else {
      const cleanDate = (r.orderDate || '').split(' ')[0] || `date-${idx}`;
      key = `${cleanDate}_${customer}_${r.userName}`;
    }

    const itemPrice = r.price || (r.quantity > 0 ? (r.subtotal || r.sales) / r.quantity : 0);
    const itemSubtotal = r.subtotal || r.sales || (itemPrice * r.quantity);
    const isOuterBox = (r.unit || '').toLowerCase() === 'box' || (r.unit || '').includes('箱') || (r.unit || '').includes('條');

    const orderItem: OrderItem = {
      id: `${key}-item-${idx}`,
      name: r.productName,
      quantity: r.quantity || 1,
      price: itemPrice,
      isOuterBox,
      unitsPerBox: r.countValue || null,
      outerBoxUnit: r.unit || null
    };

    if (!orderMap.has(key)) {
      const rem = (r.remark || r['.'] || '').toString().trim();
      orderMap.set(key, {
        id: key,
        date: r.orderDate,
        customerName: customer,
        orderAmount: itemSubtotal,
        salesName: r.userName || 'Unknown',
        remark: rem === '.' ? '' : rem,
        items: [orderItem],
        isHeld: false,
        isKeyedIn: true
      });
    } else {
      const existing = orderMap.get(key)!;
      existing.items.push(orderItem);
      existing.orderAmount += itemSubtotal;
      if (!existing.remark) {
        const rem = (r.remark || r['.'] || '').toString().trim();
        if (rem && rem !== '.') {
          existing.remark = rem;
        }
      }
    }
  }

  return Array.from(orderMap.values());
};

export interface ServerOrdersResult {
  orders: SavedOrder[];
  deletedOrderIds: string[];
}

/**
 * Fetch cross-device pending & saved orders and deleted order IDs from the server
 */
export const fetchServerOrders = async (): Promise<ServerOrdersResult> => {
  try {
    const res = await fetchWithTimeout('/api/orders', { method: 'GET' }, 4000);
    if (res.ok) {
      const json = await res.json();
      if (json && json.success) {
        return {
          orders: Array.isArray(json.orders) ? json.orders : [],
          deletedOrderIds: Array.isArray(json.deletedOrderIds) ? json.deletedOrderIds : []
        };
      }
    }
  } catch (e) {
    console.warn('Could not fetch server orders:', e);
  }
  return { orders: [], deletedOrderIds: [] };
};

/**
 * Save or update a single order on the server so other devices can see it in real-time
 */
export const saveServerOrder = async (order: SavedOrder): Promise<boolean> => {
  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order)
    });
    return res.ok;
  } catch (e) {
    console.warn('Could not save order to server:', e);
    return false;
  }
};

/**
 * Batch sync orders with the server
 */
export const syncServerOrders = async (orders: SavedOrder[]): Promise<ServerOrdersResult> => {
  try {
    const res = await fetch('/api/orders/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders })
    });
    if (res.ok) {
      const json = await res.json();
      if (json && json.success) {
        return {
          orders: Array.isArray(json.orders) ? json.orders : orders,
          deletedOrderIds: Array.isArray(json.deletedOrderIds) ? json.deletedOrderIds : []
        };
      }
    }
  } catch (e) {
    console.warn('Could not sync orders with server:', e);
  }
  return { orders, deletedOrderIds: [] };
};

/**
 * Delete an order from the server
 */
export const deleteServerOrder = async (orderId: string): Promise<string[]> => {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const json = await res.json();
      if (json && Array.isArray(json.deletedOrderIds)) {
        return json.deletedOrderIds;
      }
    }
  } catch (e) {
    console.warn('Could not delete order from server:', e);
  }
  return [orderId];
};

/**
 * Toggle hold status on the server
 */
export const toggleHoldServerOrder = async (orderId: string, isHeld?: boolean, orderData?: SavedOrder): Promise<boolean> => {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/hold`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isHeld, orderData })
    });
    return res.ok;
  } catch (e) {
    console.warn('Could not toggle hold on server:', e);
    return false;
  }
};

/**
 * Mark order as keyed in on the server
 */
export const keyInServerOrder = async (
  orderId: string, 
  isKeyedIn: boolean = true,
  extra?: { stockDeducted?: boolean; deductedItems?: { name: string; quantity: number }[] }
): Promise<boolean> => {
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/keyin`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isKeyedIn, ...extra })
    });
    return res.ok;
  } catch (e) {
    console.warn('Could not mark keyed in on server:', e);
    return false;
  }
};

/**
 * Batch mark orders as keyed in on the server
 */
export const keyInServerOrdersBatch = async (
  orderIds: string[],
  orders?: SavedOrder[]
): Promise<boolean> => {
  try {
    const res = await fetch('/api/orders/keyin-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderIds, orders })
    });
    return res.ok;
  } catch (e) {
    console.warn('Could not batch mark keyed in on server:', e);
    return false;
  }
};


