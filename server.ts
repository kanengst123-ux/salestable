import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Ensure data directory exists for shared persistent orders across devices
  const DATA_DIR = path.join(process.cwd(), "data");
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const ORDERS_FILE = path.join(DATA_DIR, "saved_orders.json");
  const DELETED_ORDERS_FILE = path.join(DATA_DIR, "deleted_order_ids.json");

  const getDeletedOrderIds = (): string[] => {
    try {
      if (fs.existsSync(DELETED_ORDERS_FILE)) {
        const raw = fs.readFileSync(DELETED_ORDERS_FILE, "utf-8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list;
      }
    } catch (err) {
      console.error("Error reading deleted orders file:", err);
    }
    return [];
  };

  const addDeletedOrderId = (orderId: string) => {
    if (!orderId) return;
    try {
      const list = getDeletedOrderIds();
      if (!list.includes(orderId)) {
        list.push(orderId);
        const trimmed = list.slice(-2000);
        fs.writeFileSync(DELETED_ORDERS_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
      }
    } catch (err) {
      console.error("Error saving deleted order ID:", err);
    }
  };

  const removeDeletedOrderId = (orderId: string) => {
    if (!orderId) return;
    try {
      let list = getDeletedOrderIds();
      if (list.includes(orderId)) {
        list = list.filter(id => id !== orderId);
        fs.writeFileSync(DELETED_ORDERS_FILE, JSON.stringify(list, null, 2), "utf-8");
      }
    } catch (err) {
      console.error("Error removing deleted order ID:", err);
    }
  };

  const isRealOrder = (o: any) => {
    if (!o || !o.id) return false;
    if (typeof o.id === "string") {
      if (o.id.startsWith("W_")) return false;
      if (/^\d{8}_\d+$/.test(o.id)) return false;
      if (/^\d{4}-\d{2}-\d{2}_/.test(o.id)) return false;
    }
    return true;
  };

  const parseCSV = (text: string): string[][] => {
    const result: string[][] = [];
    let row: string[] = [];
    let currentField = "";
    let inQuotes = false;
    const cleanText = text.replace(/^\uFEFF/, "");
    for (let i = 0; i < cleanText.length; i++) {
      const char = cleanText[i];
      const nextChar = cleanText[i + 1];
      if (inQuotes) {
        if (char === "\"") {
          if (nextChar === "\"") {
            currentField += "\"";
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === "\"") {
          inQuotes = true;
        } else if (char === ",") {
          row.push(currentField.trim());
          currentField = "";
        } else if (char === "\n" || char === "\r") {
          row.push(currentField.trim());
          if (row.length > 0) result.push(row);
          row = [];
          currentField = "";
          if (char === "\r" && nextChar === "\n") i++;
        } else {
          currentField += char;
        }
      }
    }
    if (currentField !== "" || row.length > 0) {
      row.push(currentField.trim());
      if (row.some(cell => cell.length > 0)) result.push(row);
    }
    return result;
  };

  const parseNum = (val: any): number => {
    if (!val) return 0;
    const cleaned = val.toString().replace(/[$,\s]/g, "");
    const p = parseFloat(cleaned);
    return isNaN(p) ? 0 : p;
  };

  const parseTradeSheetOrders = (csvText: string, defaultSales: string): any[] => {
    const rows = parseCSV(csvText);
    if (rows.length < 2) return [];
    const headerRow = rows[0].map(h => (h || "").toLowerCase().trim());
    let idCol = 12;
    let customerCol = 7;
    let userCol = 10;
    let dateCol = 0;
    let remarkCol = 13;
    let subtotalCol = 9;
    let qtyCol = 3;
    let unitCol = 4;
    let refCol = 5;
    let priceCol = 6;
    let itemCol = 1;

    headerRow.forEach((h, i) => {
      if (i > 2 && (h === "id" || h.includes("order"))) idCol = i;
      if (h.includes("customer") || h.includes("客戶")) customerCol = i;
      if (h === "user" || h.includes("sales") || h.includes("用戶")) userCol = i;
      if (h.includes("date") || h.includes("日期")) dateCol = i;
      if (h.includes("remark") || h.includes("備註")) remarkCol = i;
      if (h.includes("subtotal") || h.includes("小計")) subtotalCol = i;
      if (h.includes("quantity") || h === "qty" || h.includes("數量")) qtyCol = i;
      if (h === "unit" || h.includes("單位")) unitCol = i;
      if (h === "ref") refCol = i;
      if (h === "price" || h.includes("單價")) priceCol = i;
      if (h === "item" || h.includes("貨品")) itemCol = i;
    });

    const orderMap = new Map<string, any>();
    for (let rIdx = 1; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      if (!row || row.length === 0) continue;
      const orderId = (row[idCol] || row[12] || "").trim();
      const customer = (row[customerCol] || row[7] || "").trim();
      if (!orderId && !customer) continue;

      const finalId = orderId || `TRADE-${rIdx}`;
      const sales = (row[userCol] || row[10] || defaultSales || "").trim();
      const date = (row[dateCol] || row[0] || "").trim();
      const remark = (row[remarkCol] || row[13] || "").trim();
      const rawQty = parseNum(row[qtyCol] || row[3]);
      const unit = (row[unitCol] || row[4] || "unit").trim();
      const ref = parseNum(row[refCol] || row[5]) || 1;
      const price = parseNum(row[priceCol] || row[6]);
      const subtotal = parseNum(row[subtotalCol] || row[9]) || (rawQty * price);
      const isOuterBox = unit.toLowerCase() === "box" || unit.includes("箱") || unit.includes("盒") || unit.includes("條");
      const totalUnits = isOuterBox && ref > 1 ? (rawQty * ref) : (rawQty || (price > 0 ? Math.round(subtotal / price) : 1));
      const itemName = (row[itemCol] || row[1] || "Item").trim();

      const orderItem = {
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
          remark: remark === "." ? "" : remark,
          items: [orderItem],
          orderAmount: subtotal,
          isKeyedIn: true,
          isHeld: false,
          stockDeducted: true,
          deductedItems: [{ name: orderItem.name, quantity: orderItem.quantity }]
        });
      } else {
        const existing = orderMap.get(finalId);
        existing.items.push(orderItem);
        if (!existing.deductedItems) existing.deductedItems = [];
        existing.deductedItems.push({ name: orderItem.name, quantity: orderItem.quantity });
        existing.orderAmount += subtotal;
        if (!existing.remark && remark && remark !== ".") {
          existing.remark = remark;
        }
      }
    }
    return Array.from(orderMap.values());
  };

  const PRODUCT_LIST_SHEET_ID = "16yXbnBdkKuKCVGvhrUJ7YPFNVGBcyap3b5sbvqv0Dsg";
  const GVIZ_TRADE_URL = `https://docs.google.com/spreadsheets/d/${PRODUCT_LIST_SHEET_ID}/gviz/tq?tqx=out:csv&gid=1412322886`;
  const GVIZ_ADMIN_URL = `https://docs.google.com/spreadsheets/d/${PRODUCT_LIST_SHEET_ID}/gviz/tq?tqx=out:csv&gid=2071438386`;
  const PUB_TRADE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=1412322886&single=true&output=csv";
  const PUB_ADMIN_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=2071438386&single=true&output=csv";

  let cachedTradeOrders: any[] = [];
  let lastTradeFetchTime = 0;

  const fetchTradeLogOrdersFromServer = async (): Promise<any[]> => {
    const now = Date.now();
    const deletedSet = new Set(getDeletedOrderIds());
    if (cachedTradeOrders.length > 0 && (now - lastTradeFetchTime) < 2000) {
      return cachedTradeOrders.filter((o: any) => o && o.id && !deletedSet.has(o.id));
    }

    const fetchSheetCSV = async (gvizUrl: string, pubUrl: string): Promise<string> => {
      try {
        const gvizWithTime = gvizUrl.includes("?") ? `${gvizUrl}&t=${Date.now()}` : `${gvizUrl}?t=${Date.now()}`;
        const res = await fetch(gvizWithTime, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const text = await res.text();
          if (text.length > 50) return text;
        }
      } catch {}
      try {
        const res2 = await fetch(`${pubUrl}&t=${Date.now()}`, { signal: AbortSignal.timeout(5000) });
        if (res2.ok) return await res2.text();
      } catch {}
      return "";
    };

    try {
      const [tradeCsv, adminCsv] = await Promise.all([
        fetchSheetCSV(GVIZ_TRADE_URL, PUB_TRADE_URL),
        fetchSheetCSV(GVIZ_ADMIN_URL, PUB_ADMIN_URL)
      ]);

      const tradeOrders = tradeCsv ? parseTradeSheetOrders(tradeCsv, "Sales") : [];
      const adminOrders = adminCsv ? parseTradeSheetOrders(adminCsv, "Admin") : [];
      const all = [...tradeOrders, ...adminOrders];
      const valid = all.filter((o: any) => o && o.id && !deletedSet.has(o.id));
      if (valid.length > 0) {
        cachedTradeOrders = valid;
        lastTradeFetchTime = now;
        return valid;
      }
    } catch (err) {
      console.warn("Failed to fetch trade log orders from Google Sheets:", err);
    }
    return cachedTradeOrders.filter((o: any) => o && o.id && !deletedSet.has(o.id));
  };

  const getSavedOrders = (): any[] => {
    try {
      if (fs.existsSync(ORDERS_FILE)) {
        const raw = fs.readFileSync(ORDERS_FILE, "utf-8");
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const deletedSet = new Set(getDeletedOrderIds());
          return list.filter((o: any) => isRealOrder(o) && !deletedSet.has(o.id));
        }
      }
    } catch (err) {
      console.error("Error reading saved orders file:", err);
    }
    return [];
  };

  const saveOrdersToFile = (orders: any[]) => {
    try {
      fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
    } catch (err) {
      console.error("Error writing saved orders file:", err);
    }
  };

  // In-memory image buffer cache for ultra-fast serving
  const imageCache = new Map<string, { buffer: Buffer; contentType: string }>();
  const MAX_IMAGE_CACHE = 500;

  function detectImageContentType(buffer: Buffer, headerType?: string | null): string {
    if (buffer.length >= 12) {
      if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
          buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return "image/webp";
      }
      if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
      }
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return "image/png";
      }
      if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
        return "image/gif";
      }
    }
    if (headerType && headerType.startsWith("image/")) {
      return headerType;
    }
    return "image/jpeg";
  }

  function formatProductId(id: string | number | undefined | null): string {
    if (id === undefined || id === null) return "";
    const str = String(id).trim();
    if (!str) return "";
    const numOnly = str.replace(/^id-/, "").trim();
    return numOnly ? `id-${numOnly}` : str;
  }

  // Cache sheet product image mapping (Sheet15: Col A Product ID -> Col D Image URLs)
  let sheetProductImageMap: Map<string, string> | null = null;
  let lastSheetProductImageFetch = 0;

  async function getProductImageUrlFromSheet(productId: string): Promise<string | null> {
    const formattedId = formatProductId(productId);
    const numId = productId.replace(/^id-/, "").trim();
    const now = Date.now();
    if (!sheetProductImageMap || now - lastSheetProductImageFetch > 10 * 60 * 1000) {
      try {
        const SHEET15_PUB_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=1813720414&single=true&output=csv";
        const SHEET15_GVIZ_URL = `https://docs.google.com/spreadsheets/d/${PRODUCT_LIST_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Sheet15`;

        let csvText = "";
        try {
          const res = await fetch(SHEET15_PUB_URL, { signal: AbortSignal.timeout(5000) });
          if (res.ok) csvText = await res.text();
        } catch {
          // Fallback to GVIZ
        }

        if (!csvText) {
          try {
            const res = await fetch(SHEET15_GVIZ_URL, { signal: AbortSignal.timeout(5000) });
            if (res.ok) csvText = await res.text();
          } catch (err) {
            console.warn("Failed to fetch Sheet15 via GVIZ:", err);
          }
        }

        if (csvText) {
          const rows = parseCSV(csvText);
          const map = new Map<string, string>();
          let pIdIdx = 0; // Col A
          let imgIdx = 3; // Col D
          if (rows.length > 0) {
            const headers = rows[0].map(h => h.trim().toLowerCase());
            const foundId = headers.findIndex(h => h.replace(/[\s_-]/g, "") === "productid" || h === "id");
            if (foundId !== -1) pIdIdx = foundId;
            const foundImg = headers.findIndex(h => h === "image urls" || h === "image url" || h === "image");
            if (foundImg !== -1) imgIdx = foundImg;
          }
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const rawId = (row[pIdIdx] || "").trim();
            const rawImg = (row[imgIdx] || "").trim();
            const match = rawImg.match(/https?:\/\/[^\s,"'>|]+/);
            if (rawId && match) {
              const fId = formatProductId(rawId);
              const nId = rawId.replace(/^id-/, "").trim();
              map.set(fId, match[0]);
              map.set(nId, match[0]);
              map.set(rawId, match[0]);
            }
          }
          sheetProductImageMap = map;
          lastSheetProductImageFetch = now;
        }
      } catch (e) {
        console.warn("Failed to fetch Sheet15 for images:", e);
      }
    }
    return (
      sheetProductImageMap?.get(formattedId) ||
      sheetProductImageMap?.get(numId) ||
      sheetProductImageMap?.get(productId) ||
      null
    );
  }

  // Authority products list helper (builds canonical list strictly by product ID)
  async function getAuthorityProductsList(): Promise<{ id: string; name: string; extraAttributes: { "Image URLs": string } }[]> {
    await getProductImageUrlFromSheet("warmup");
    const MASTER_PUB_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?gid=687938954&single=true&output=csv";
    const res = await fetch(MASTER_PUB_URL, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error("Failed to fetch master sheet: " + res.statusText);
    const text = await res.text();
    const rows = parseCSV(text);
    if (rows.length < 2) return [];

    let pIdIdx = 1; // Col B
    let titleIdx = 2; // Col C
    let imgIdx = 38; // Col AM
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const foundPid = headers.findIndex(h => h.replace(/[\s_-]/g, "") === "productid" || h === "id");
    if (foundPid !== -1) pIdIdx = foundPid;
    const foundTitle = headers.findIndex(h => h === "title" || h === "item" || h === "product name");
    if (foundTitle !== -1) titleIdx = foundTitle;
    const foundImg = headers.findIndex(h => h === "image urls" || h === "image url" || h === "image");
    if (foundImg !== -1) imgIdx = foundImg;

    const list: { id: string; name: string; extraAttributes: { "Image URLs": string } }[] = [];
    const seenIds = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawId = (row[pIdIdx] || "").trim();
      const name = (row[titleIdx] || "").trim();
      if (!name || name.toLowerCase() === "title") continue;
      const fId = formatProductId(rawId);
      if (!fId || seenIds.has(fId)) continue;
      seenIds.add(fId);

      // Strict ID match for image
      let img = sheetProductImageMap?.get(fId) || sheetProductImageMap?.get(rawId) || "";
      if (!img && row[imgIdx]) {
        const m = (row[imgIdx] || "").match(/https?:\/\/[^\s,"'>|]+/);
        if (m) img = m[0];
      }

      list.push({
        id: fId,
        name,
        extraAttributes: {
          "Image URLs": img
        }
      });
    }

    return list;
  }

  // API Routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Authority products list endpoint
  app.get("/api/products", async (req, res) => {
    // 1. Try remote authority endpoints first
    const remoteBases = [
      "https://ais-dev-e67qvrm3vxclidkmxocymu-259187692597.us-east1.run.app",
      "https://ais-pre-e67qvrm3vxclidkmxocymu-259187692597.us-east1.run.app"
    ];

    for (const base of remoteBases) {
      try {
        const remoteResp = await fetch(`${base}/api/products`, {
          signal: AbortSignal.timeout(3000),
        });
        if (remoteResp.ok) {
          const data = await remoteResp.json();
          if (data && Array.isArray(data.products) && data.products.length > 0) {
            res.json(data);
            return;
          }
        }
      } catch {}
    }

    // 2. Build local authoritative products list with strict Unique ID matching
    try {
      const products = await getAuthorityProductsList();
      res.json({ products });
    } catch (err) {
      console.error("Failed to build products list:", err);
      res.status(500).json({ error: String(err) });
    }
  });

  // Exact Product Image Endpoint - matches formatted product ID strictly: /api/products/:id/image
  app.get("/api/products/:id/image", async (req, res) => {
    const rawId = (req.params.id || "").trim();
    const formattedId = formatProductId(rawId);
    if (!formattedId || formattedId === "id-") {
      res.status(400).json({ error: "Missing or invalid product id" });
      return;
    }

    // 1. Check in-memory image cache
    if (imageCache.has(formattedId)) {
      const cached = imageCache.get(formattedId)!;
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
      res.send(cached.buffer);
      return;
    }

    // 2. Check local images directory in data/images
    const localImgDir = path.join(process.cwd(), "data", "images");
    const extensions = ["", ".jpg", ".png", ".jpeg", ".webp"];
    for (const ext of extensions) {
      const candidate = path.join(localImgDir, `${formattedId}${ext}`);
      if (fs.existsSync(candidate)) {
        try {
          const stat = fs.statSync(candidate);
          if (stat.isFile()) {
            res.setHeader("Cache-Control", "public, max-age=86400");
            res.sendFile(candidate);
            return;
          }
        } catch {}
      }
    }

    // 3. Try remote authority endpoints
    const remoteBases = [
      "https://ais-dev-e67qvrm3vxclidkmxocymu-259187692597.us-east1.run.app",
      "https://ais-pre-e67qvrm3vxclidkmxocymu-259187692597.us-east1.run.app"
    ];

    for (const base of remoteBases) {
      try {
        const remoteUrl = `${base}/api/products/${encodeURIComponent(formattedId)}/image`;
        const remoteResp = await fetch(remoteUrl, {
          signal: AbortSignal.timeout(3500),
          headers: { Accept: "image/*,*/*;q=0.8" },
          redirect: "follow",
        });
        if (remoteResp.ok) {
          const cType = remoteResp.headers.get("content-type") || "";
          if (cType.startsWith("image/")) {
            const buffer = Buffer.from(await remoteResp.arrayBuffer());
            const contentType = detectImageContentType(buffer, cType);
            if (imageCache.size >= MAX_IMAGE_CACHE) {
              const firstKey = imageCache.keys().next().value;
              if (firstKey) imageCache.delete(firstKey);
            }
            imageCache.set(formattedId, { buffer, contentType });
            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
            res.send(buffer);
            return;
          }
        }
      } catch {}
    }

    // 4. Exact ID lookup from Google Sheet (Col A in Sheet15 strictly matches product ID)
    try {
      const sheetUrl = await getProductImageUrlFromSheet(formattedId);
      if (sheetUrl) {
        const resp = await fetch(sheetUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            Accept: "image/webp,image/apng,image/*,*/*;q=0.8",
          },
          signal: AbortSignal.timeout(5000),
        });
        if (resp.ok) {
          const buffer = Buffer.from(await resp.arrayBuffer());
          const contentType = detectImageContentType(buffer, resp.headers.get("content-type"));
          if (imageCache.size >= MAX_IMAGE_CACHE) {
            const firstKey = imageCache.keys().next().value;
            if (firstKey) imageCache.delete(firstKey);
          }
          imageCache.set(formattedId, { buffer, contentType });
          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
          res.send(buffer);
          return;
        }
      }
    } catch (err) {
      console.warn(`Error resolving image for ${formattedId}:`, err);
    }

    // 5. Not found - 404
    res.status(404).json({ error: `Image not found for product ID ${formattedId}` });
  });

  // Alias /api/product-image/:id to the same exact handler
  app.get("/api/product-image/:id", (req, res) => {
    const formattedId = formatProductId(req.params.id);
    res.redirect(`/api/products/${encodeURIComponent(formattedId)}/image`);
  });

  // General proxy endpoint to safely fetch and serve images bypassing iframe CORS & mime issues
  app.get("/api/proxy-image", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url.trim() : "";
    if (!rawUrl || !rawUrl.startsWith("http")) {
      res.status(400).json({ error: "Invalid image URL" });
      return;
    }

    if (imageCache.has(rawUrl)) {
      const cached = imageCache.get(rawUrl)!;
      res.setHeader("Content-Type", cached.contentType);
      res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
      res.send(cached.buffer);
      return;
    }

    try {
      const resp = await fetch(rawUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!resp.ok) {
        res.status(resp.status).json({ error: "Failed to fetch image" });
        return;
      }

      const buffer = Buffer.from(await resp.arrayBuffer());
      const contentType = detectImageContentType(buffer, resp.headers.get("content-type"));

      if (imageCache.size >= MAX_IMAGE_CACHE) {
        const firstKey = imageCache.keys().next().value;
        if (firstKey) imageCache.delete(firstKey);
      }
      imageCache.set(rawUrl, { buffer, contentType });

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
      res.send(buffer);
    } catch (err) {
      res.status(500).json({ error: "Image fetch error: " + String(err) });
    }
  });

  // Strictly fetch Trade_log orders only (excluding Trade_log_admin and any local/saved drafts)
  app.get("/api/trade-log-only", async (req, res) => {
    try {
      const gvizWithTime = `${GVIZ_TRADE_URL}&t=${Date.now()}`;
      let csv = "";
      try {
        const r1 = await fetch(gvizWithTime, { signal: AbortSignal.timeout(5000) });
        if (r1.ok) {
          const txt = await r1.text();
          if (txt.length > 50) csv = txt;
        }
      } catch {}

      if (!csv) {
        try {
          const r2 = await fetch(`${PUB_TRADE_URL}&t=${Date.now()}`, { signal: AbortSignal.timeout(5000) });
          if (r2.ok) csv = await r2.text();
        } catch {}
      }

      if (csv) {
        const orders = parseTradeSheetOrders(csv, "Sales");
        res.json({ success: true, orders });
        return;
      }
      res.json({ success: true, orders: [] });
    } catch (err) {
      res.status(500).json({ success: false, error: String(err), orders: [] });
    }
  });

  // Get orders directly from Trade_log and Trade_log_admin tabs of Product_list
  app.get("/api/trade-orders", async (req, res) => {
    try {
      const orders = await fetchTradeLogOrdersFromServer();
      const deletedOrderIds = getDeletedOrderIds();
      const deletedSet = new Set(deletedOrderIds);
      const activeOrders = orders.filter((o: any) => o && o.id && !deletedSet.has(o.id));
      res.json({ success: true, orders: activeOrders, deletedOrderIds });
    } catch (err) {
      console.error("Error fetching trade orders:", err);
      res.status(500).json({ success: false, error: String(err), deletedOrderIds: getDeletedOrderIds() });
    }
  });

  // Get all shared saved/pending orders across devices with deleted order IDs
  app.get("/api/orders", async (req, res) => {
    try {
      const deletedOrderIds = getDeletedOrderIds();
      const deletedSet = new Set(deletedOrderIds);
      const orders = getSavedOrders().filter((o: any) => !deletedSet.has(o.id));
      res.json({ success: true, orders, deletedOrderIds });
    } catch (err) {
      res.json({ success: true, orders: [], deletedOrderIds: getDeletedOrderIds() });
    }
  });

  // Get deleted order IDs
  app.get("/api/orders/deleted", (req, res) => {
    res.json({ success: true, deletedOrderIds: getDeletedOrderIds() });
  });

  // Save or update an order
  app.post("/api/orders", (req, res) => {
    const order = req.body;
    if (!order || !order.id) {
      res.status(400).json({ error: "Order ID is required" });
      return;
    }
    // If an order is explicitly saved afresh, ensure it is un-deleted
    removeDeletedOrderId(order.id);

    const orders = getSavedOrders();
    const idx = orders.findIndex((o: any) => o.id === order.id);
    if (idx !== -1) {
      orders[idx] = { ...orders[idx], ...order };
    } else {
      orders.unshift(order);
    }
    saveOrdersToFile(orders);
    res.json({ success: true, order });
  });

  // Batch sync orders (e.g. from local storage)
  app.post("/api/orders/sync", (req, res) => {
    const incoming: any[] = req.body.orders || [];
    if (!Array.isArray(incoming)) {
      res.status(400).json({ error: "orders array required" });
      return;
    }
    const deletedOrderIds = getDeletedOrderIds();
    const deletedSet = new Set(deletedOrderIds);
    const currentOrders = getSavedOrders().filter((o: any) => !deletedSet.has(o.id));
    const orderMap = new Map<string, any>();

    // Existing server orders (strictly excluding deleted orders)
    currentOrders.filter(isRealOrder).forEach((o: any) => {
      if (o && o.id && !deletedSet.has(o.id)) orderMap.set(o.id, o);
    });

    // Merge incoming (strictly ignoring any deleted orders and historical Log invoices)
    incoming.filter(isRealOrder).forEach((o: any) => {
      if (o && o.id && !deletedSet.has(o.id)) {
        if (!orderMap.has(o.id)) {
          orderMap.set(o.id, o);
        } else {
          const existing = orderMap.get(o.id);
          orderMap.set(o.id, { ...existing, ...o });
        }
      }
    });

    const merged = Array.from(orderMap.values());
    saveOrdersToFile(merged);
    res.json({ success: true, orders: merged, deletedOrderIds });
  });

  // Delete an order
  app.delete("/api/orders/:id", (req, res) => {
    const orderId = req.params.id;
    addDeletedOrderId(orderId);

    // Evict from in-memory trade orders cache immediately
    cachedTradeOrders = cachedTradeOrders.filter((o: any) => o.id !== orderId);
    lastTradeFetchTime = 0; // Force immediate fresh fetch from Google Sheets next time

    let orders = getSavedOrders();
    orders = orders.filter((o: any) => o.id !== orderId);
    saveOrdersToFile(orders);
    res.json({ success: true, deletedOrderIds: getDeletedOrderIds() });
  });

  // Toggle hold on an order
  app.patch("/api/orders/:id/hold", (req, res) => {
    const orderId = req.params.id;
    const { isHeld, orderData } = req.body || {};
    const orders = getSavedOrders();
    const idx = orders.findIndex((o: any) => o.id === orderId);

    let updatedOrder: any = null;

    if (idx !== -1) {
      const current = orders[idx];
      const nextHeld = typeof isHeld === "boolean" ? isHeld : !current.isHeld;
      current.isHeld = nextHeld;
      if (nextHeld) {
        current.isKeyedIn = false;
        current.stockDeducted = false;
        current.deductedItems = [];
      }
      current.updatedAt = Date.now();
      if (orderData && typeof orderData === "object") {
        orders[idx] = { 
          ...current, 
          ...orderData, 
          id: orderId, 
          isHeld: nextHeld, 
          isKeyedIn: nextHeld ? false : (orderData.isKeyedIn !== undefined ? orderData.isKeyedIn : current.isKeyedIn), 
          stockDeducted: orderData.stockDeducted !== undefined ? orderData.stockDeducted : (nextHeld ? false : current.stockDeducted),
          deductedItems: orderData.deductedItems || (nextHeld ? [] : current.deductedItems),
          updatedAt: Date.now() 
        };
      }
      updatedOrder = orders[idx];
    } else {
      // Order not yet in saved_orders file (e.g. came directly from Trade_log)
      const fromTrade = cachedTradeOrders.find((o: any) => o && o.id === orderId);
      const base = orderData || fromTrade || { id: orderId };
      const nextHeld = typeof isHeld === "boolean" ? isHeld : true;
      updatedOrder = {
        ...base,
        id: orderId,
        isHeld: nextHeld,
        isKeyedIn: nextHeld ? false : Boolean(base.isKeyedIn),
        stockDeducted: nextHeld ? false : (base.stockDeducted !== undefined ? base.stockDeducted : true),
        deductedItems: nextHeld ? [] : (base.deductedItems || (base.items ? base.items.map((it: any) => ({ name: it.name, quantity: it.quantity })) : undefined)),
        updatedAt: Date.now()
      };
      orders.unshift(updatedOrder);
    }

    // When an order is held, immediately remove from in-memory trade orders cache
    if (updatedOrder && updatedOrder.isHeld) {
      cachedTradeOrders = cachedTradeOrders.filter((o: any) => o && o.id !== orderId);
      lastTradeFetchTime = 0;
    }

    saveOrdersToFile(orders);
    res.json({ success: true, order: updatedOrder });
  });

  // Explicitly remove order from trade log cache
  app.post("/api/orders/:id/remove-trade-log", (req, res) => {
    const orderId = req.params.id;
    cachedTradeOrders = cachedTradeOrders.filter((o: any) => o && o.id !== orderId);
    lastTradeFetchTime = 0;
    const orders = getSavedOrders();
    const existing = orders.find((o: any) => o.id === orderId);
    if (existing) {
      existing.isKeyedIn = false;
      existing.isHeld = true;
      existing.updatedAt = Date.now();
      saveOrdersToFile(orders);
    }
    res.json({ success: true, orderId });
  });

  // Mark order as keyed in or unkeyed
  app.patch("/api/orders/:id/keyin", (req, res) => {
    const orderId = req.params.id;
    const isKeyedIn = req.body && req.body.isKeyedIn !== undefined ? Boolean(req.body.isKeyedIn) : true;
    const orders = getSavedOrders();
    const order = orders.find((o: any) => o.id === orderId);
    if (order) {
      order.isKeyedIn = isKeyedIn;
      if (isKeyedIn) order.isHeld = false;
      if (req.body.stockDeducted !== undefined) order.stockDeducted = req.body.stockDeducted;
      if (req.body.deductedItems !== undefined) order.deductedItems = req.body.deductedItems;
      order.updatedAt = Date.now();
    } else {
      orders.unshift({ 
        id: orderId, 
        isKeyedIn, 
        isHeld: false, 
        stockDeducted: req.body.stockDeducted !== undefined ? req.body.stockDeducted : isKeyedIn,
        deductedItems: req.body.deductedItems,
        updatedAt: Date.now() 
      });
    }
    saveOrdersToFile(orders);
    lastTradeFetchTime = 0; // Force immediate refresh of trade orders from Google Sheets
    res.json({ success: true, isKeyedIn });
  });

  // Batch mark orders as keyed in
  app.post("/api/orders/keyin-batch", (req, res) => {
    const orderIds: string[] = req.body.orderIds || [];
    const incomingOrders: any[] = req.body.orders || [];
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      res.json({ success: true, count: 0 });
      return;
    }
    const incomingMap = new Map<string, any>();
    incomingOrders.forEach(o => { if (o && o.id) incomingMap.set(o.id, o); });

    const idSet = new Set(orderIds);
    const orders = getSavedOrders();
    orders.forEach((o: any) => {
      if (idSet.has(o.id)) {
        o.isKeyedIn = true;
        o.isHeld = false;
        o.stockDeducted = true;
        const extra = incomingMap.get(o.id);
        if (extra?.deductedItems) o.deductedItems = extra.deductedItems;
        else if (!o.deductedItems && o.items) o.deductedItems = o.items.map((it: any) => ({ name: it.name, quantity: it.quantity }));
        o.updatedAt = Date.now();
        idSet.delete(o.id);
      }
    });
    // Add any remaining order IDs that weren't in saved_orders.json
    idSet.forEach(id => {
      const extra = incomingMap.get(id);
      orders.unshift({ 
        id, 
        isKeyedIn: true, 
        isHeld: false, 
        stockDeducted: true,
        deductedItems: extra?.deductedItems,
        updatedAt: Date.now() 
      });
    });
    saveOrdersToFile(orders);
    lastTradeFetchTime = 0; // Force immediate refresh of trade orders from Google Sheets
    res.json({ success: true, count: orderIds.length });
  });

  // Vite middleware for development (HMR disabled to prevent reload on app minimize/switch)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // In Express v5, use '*all' for catch-all route
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
