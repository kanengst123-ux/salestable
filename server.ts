import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Google Cloud Storage S3 Compatible HMAC configuration
const bucketName = process.env.GCS_BUCKET_NAME || "my-product-catalog-images";
let s3Client: S3Client | null = null;
let gcsDisabledDueToBilling = false;

function handleGcsError(error: any, context: string) {
  const errMsg = error?.message || "";
  if (errMsg.includes("delinquent billing account") || errMsg.includes("billing account") || errMsg.includes("Billing") || errMsg.includes("delinquent")) {
    if (!gcsDisabledDueToBilling) {
      gcsDisabledDueToBilling = true;
      console.warn(`[GCS Sync Client] GCS billing account is delinquent or disabled. Automatically disabling GCS integration and falling back to robust local file storage to ensure flawless app execution. Error details during ${context}: ${errMsg}`);
    }
  } else {
    console.error(`[GCS Sync Client] Error during ${context}:`, error?.message || error);
  }
}

if (process.env.GCS_ACCESS_KEY && process.env.GCS_SECRET_KEY) {
  s3Client = new S3Client({
    endpoint: "https://storage.googleapis.com",
    region: "auto",
    credentials: {
      accessKeyId: process.env.GCS_ACCESS_KEY,
      secretAccessKey: process.env.GCS_SECRET_KEY,
    },
  });
  console.log(`[GCS Sync Client] Initialized S3 Client for GCS bucket: ${bucketName}`);
} else {
  console.log(`[GCS Sync Client] GCS Credentials not present in env. Running in client local fallback mode.`);
}

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

// Simple CSV parser supporting quotes
function parseCSV(csvText: string): string[][] {
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentLine.push(currentField);
        currentField = '';
      } else if (char === '\r' || char === '\n') {
        currentLine.push(currentField);
        currentField = '';
        // Only push non-empty lines
        if (currentLine.some(cell => cell.trim().length > 0)) {
          lines.push(currentLine);
        }
        currentLine = [];
        if (char === '\r' && nextChar === '\n') {
          i++; // skip \n
        }
      } else {
        currentField += char;
      }
    }
  }
  if (currentField || currentLine.length > 0) {
    currentLine.push(currentField);
    lines.push(currentLine);
  }
  return lines;
}

// Memory cache for products to prevent rate-limiting or loading delay
let productsCache: any[] = [];
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 1000; // 60 seconds

async function fetchProductsFromSheet() {
  const now = Date.now();
  if (productsCache.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
    return productsCache;
  }

  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?output=csv&gid=687938954";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Google Sheet: ${response.statusText}`);
    }
    const csvText = await response.text();
    const rows = parseCSV(csvText);

    if (rows.length < 2) {
      throw new Error("CSV does not contain sufficient rows");
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Map rows to clean Product representations
    const rawProducts = dataRows.map((row, index) => {
      const prodId = row[1] || `PROD-${index + 1}`;
      const name = row[2] || "Unnamed Product";
      const price = row[14] || "0.00";
      const priceA = (row[17] || "").trim() || price;
      const priceB = (row[18] || "").trim() || price;
      const priceC = (row[19] || "").trim() || price;
      const abVal = (row[27] || "").trim();
      const acVal = (row[28] || "").trim();

      // Stock logic:
      // If Col AB is 1, always stock (hasStock = true).
      // If Col AB is 0, check AC.
      // If Col AC is 0, then grey out product pic (hasStock = false).
      const alwaysStock = abVal === "1";
      const secondaryStock = acVal !== "0" && acVal !== "";
      const hasStock = alwaysStock ? true : secondaryStock;

      // Capture all other columns so the frontend can build custom details dynamically
      const extraAttributes: Record<string, string> = {};
      headers.forEach((header, colIndex) => {
        if (header && colIndex !== 1 && colIndex !== 2 && colIndex !== 14) {
          extraAttributes[header] = row[colIndex] || "";
        }
      });

      return {
        id: prodId,
        name,
        price,
        priceA,
        priceB,
        priceC,
        hasStock,
        alwaysStock,
        secondaryStockCount: acVal,
        extraAttributes,
        allValues: row // Keep a raw representation
      };
    }).filter(p => p.id && p.name !== "Unnamed Product");

    // Deduplicate products by ID to prevent duplicate key warning and redundant product cards in UI
    const uniqueProducts: any[] = [];
    const seenIds = new Set<string>();
    for (const p of rawProducts) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        uniqueProducts.push(p);
      }
    }

    productsCache = uniqueProducts;
    lastFetchTime = now;
    
    // Save a local JSON backup for offline/error resilience
    try {
      fs.writeFileSync("products_backup.json", JSON.stringify(uniqueProducts, null, 2));
    } catch (e) {
      console.error("Failed to write products backup:", e);
    }

    return uniqueProducts;
  } catch (error) {
    console.error("Error fetching products from Google Sheets, attempting backup:", error);
    if (productsCache.length > 0) {
      return productsCache;
    }
    try {
      if (fs.existsSync("products_backup.json")) {
        const backupData = fs.readFileSync("products_backup.json", "utf-8");
        const parsedBackup = JSON.parse(backupData);
        const uniqueBackup: any[] = [];
        const seenIds = new Set<string>();
        for (const p of parsedBackup) {
          if (p && p.id && !seenIds.has(p.id)) {
            seenIds.add(p.id);
            uniqueBackup.push(p);
          }
        }
        productsCache = uniqueBackup;
        return productsCache;
      }
    } catch (backupError) {
      console.error("No valid backup found:", backupError);
    }
    return [];
  }
}

let costCategoriesCache: {
  symbolToName: Record<string, string>;
  productIdToSymbol: Record<string, string>;
} | null = null;
let lastCostFetchTime = 0;

async function fetchCostCategories() {
  const now = Date.now();
  if (costCategoriesCache && (now - lastCostFetchTime) < CACHE_DURATION) {
    return costCategoriesCache;
  }

  const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vStdyv4mUaIdO-jPeUwBfxMxBZbCkbNEtk8VNhyrpiAInlNb7w3jli2jYtERyVPp94aWMeVuP4N0XNv/pub?output=csv&gid=0";
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Google Sheet Cost Tab: ${response.statusText}`);
    }
    const csvText = await response.text();
    const rows = parseCSV(csvText);

    const symbolToName: Record<string, string> = {};
    const productIdToSymbol: Record<string, string> = {};

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;

      const prodId = (row[0] || "").replace(/\r/g, "").trim();
      const catSymbol = (row[1] || "").replace(/\r/g, "").trim();

      if (prodId && catSymbol) {
        productIdToSymbol[prodId] = catSymbol;
      }

      const mapSymbol = (row[4] || "").replace(/\r/g, "").trim();
      const mapName = (row[5] || "").replace(/\r/g, "").trim();

      if (mapSymbol && mapName) {
        symbolToName[mapSymbol] = mapName;
      }
    }

    costCategoriesCache = { symbolToName, productIdToSymbol };
    lastCostFetchTime = now;

    try {
      fs.writeFileSync("cost_categories_backup.json", JSON.stringify(costCategoriesCache, null, 2));
    } catch (e) {
      console.error("Failed to write cost categories backup:", e);
    }

    return costCategoriesCache;
  } catch (error) {
    console.error("Error fetching cost categories from Google Sheets, attempting backup:", error);
    if (costCategoriesCache) {
      return costCategoriesCache;
    }
    try {
      if (fs.existsSync("cost_categories_backup.json")) {
        const backupData = fs.readFileSync("cost_categories_backup.json", "utf-8");
        costCategoriesCache = JSON.parse(backupData);
        return costCategoriesCache!;
      }
    } catch (backupError) {
      console.error("No valid cost categories backup found:", backupError);
    }
    return { symbolToName: {}, productIdToSymbol: {} };
  }
}

// Local products persistence helpers
const LOCAL_PRODUCTS_FILE = path.join(process.cwd(), "local_products.json");

function getLocalProducts(): any[] {
  try {
    if (fs.existsSync(LOCAL_PRODUCTS_FILE)) {
      return JSON.parse(fs.readFileSync(LOCAL_PRODUCTS_FILE, "utf-8"));
    }
  } catch (error) {
    console.error("Failed to read local products:", error);
  }
  return [];
}

function saveLocalProducts(products: any[]) {
  try {
    fs.writeFileSync(LOCAL_PRODUCTS_FILE, JSON.stringify(products, null, 2));
  } catch (error) {
    console.error("Failed to save local products:", error);
  }
}

// Google Sheets Integration settings persistence helpers
const SHEET_SETTINGS_FILE = path.join(process.cwd(), "sheet_settings.json");

function getSheetSettings() {
  try {
    if (fs.existsSync(SHEET_SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SHEET_SETTINGS_FILE, "utf-8"));
      return {
        appsScriptUrl: data.appsScriptUrl || "https://script.google.com/macros/s/AKfycbxJBpLD4XstIGc_47V4ys3WYr_OX5vfsc36u5aEIsAyv06wYDWT_FFuAooQVMt1Pq8R/exec",
        enabled: data.enabled !== undefined ? !!data.enabled : true
      };
    }
  } catch (error) {
    console.error("Failed to read sheet settings:", error);
  }
  return { 
    appsScriptUrl: "https://script.google.com/macros/s/AKfycbxJBpLD4XstIGc_47V4ys3WYr_OX5vfsc36u5aEIsAyv06wYDWT_FFuAooQVMt1Pq8R/exec", 
    enabled: true 
  };
}

function saveSheetSettings(settings: any) {
  try {
    fs.writeFileSync(SHEET_SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error("Failed to save sheet settings:", error);
  }
}

async function triggerSheetsSync(id: string, name: string, price: string, quantity: string, remarks: string, action: string = "addProduct") {
  const settings = getSheetSettings();
  if (settings.enabled && settings.appsScriptUrl) {
    try {
      console.log(`Forwarding update to Google Sheets Apps Script Web App for id: ${id}, action: ${action}`);
      // Use dynamic import for fetch if needed, but since NodeJS 18 has global fetch, we call it directly
      const response = await fetch(settings.appsScriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, name, price, quantity, remarks })
      });
      const responseText = await response.text();
      console.log("Apps Script response:", responseText);
    } catch (err) {
      console.error("Failed to sync to Google Sheets Apps Script:", err);
    }
  }
}

// API Routes
app.use(express.json({ limit: "100mb" }));

app.get("/api/sheet-settings", (req, res) => {
  res.json(getSheetSettings());
});

app.post("/api/sheet-settings", (req, res) => {
  try {
    const { appsScriptUrl, enabled } = req.body;
    const settings = {
      appsScriptUrl: appsScriptUrl || "",
      enabled: !!enabled
    };
    saveSheetSettings(settings);
    res.json({ success: true, settings });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to save sheet settings" });
  }
});

app.get("/api/public-images", (req, res) => {
  try {
    const publicDir = path.join(process.cwd(), "public");
    if (fs.existsSync(publicDir)) {
      const files = fs.readdirSync(publicDir);
      res.json({ files });
    } else {
      res.json({ files: [] });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list public images" });
  }
});

app.post("/api/upload-image", async (req, res) => {
  try {
    const { filename, base64 } = req.body;
    if (!filename || !base64) {
      return res.status(400).json({ error: "Filename and base64 data are required" });
    }

    // Clean filename to prevent directory traversal attacks
    const safeFilename = path.basename(filename);
    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(safeFilename)) {
      return res.status(400).json({ error: "Invalid file extension. Standard web images only." });
    }

    // Remove data-uri scheme (e.g. data:image/jpeg;base64,) if present
    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    const filePath = path.join(publicDir, safeFilename);

    // Save locally as quick-access cache / fallback
    fs.writeFileSync(filePath, buffer);

    if (s3Client && !gcsDisabledDueToBilling) {
      try {
        console.log(`[GCS Sync Client] Initiating bucket upload for: ${safeFilename}`);
        const command = new PutObjectCommand({
          Bucket: bucketName,
          Key: safeFilename,
          Body: buffer,
          ContentType: getMimeType(safeFilename),
        });
        await s3Client.send(command);
        console.log(`[GCS Sync Client] Successfully uploaded to GCS: ${safeFilename}`);
      } catch (gcsError: any) {
        handleGcsError(gcsError, "upload-image");
      }
    } else {
      console.log(`Saved customer product image locally: ${safeFilename}`);
    }

    res.json({ success: true, url: `/${safeFilename}` });
  } catch (error: any) {
    console.error("Upload error:", error);
    res.status(500).json({ error: error.message || "Failed to save file." });
  }
});

app.post("/api/products", (req, res) => {
  try {
    const { id, name, price, quantity, remarks, base64Image } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const finalId = id ? id.trim() : `id-${Math.floor(1000000000000000 + Math.random() * 9000000000000000)}`;

    if (base64Image) {
      const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const publicDir = path.join(process.cwd(), "public");
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filePath = path.join(publicDir, `${finalId}.jpg`);
      fs.writeFileSync(filePath, buffer);
      console.log(`Saved newly added product image: ${finalId}.jpg`);
    }

    const qtyNumber = parseInt(quantity, 10);
    const hasStock = isNaN(qtyNumber) ? true : qtyNumber > 0;
    const secondaryStockCount = isNaN(qtyNumber) ? "" : qtyNumber.toString();

    const newProduct = {
      id: finalId,
      name,
      price: price || "0",
      hasStock,
      alwaysStock: isNaN(qtyNumber) || quantity === "",
      secondaryStockCount,
      extraAttributes: {
        "Categories": "Local Additions",
        "Merchant Remark": remarks || "",
        "remarks": remarks || ""
      },
      allValues: []
    };

    const localProducts = getLocalProducts();
    localProducts.unshift(newProduct);
    saveLocalProducts(localProducts);

    // Sync to Google Sheet if enabled
    triggerSheetsSync(finalId, name, price || "0", quantity, remarks || "", "addProduct");

    res.json({ success: true, product: newProduct });
  } catch (error: any) {
    console.error("Error adding product:", error);
    res.status(500).json({ error: error.message || "Failed to add product" });
  }
});

app.put("/api/products/:id", (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, quantity, remarks, base64Image } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (base64Image) {
      const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, "base64");
      const publicDir = path.join(process.cwd(), "public");
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      const filePath = path.join(publicDir, `${id}.jpg`);
      fs.writeFileSync(filePath, buffer);
      console.log(`Saved updated product image: ${id}.jpg`);
    }

    const qtyNumber = parseInt(quantity, 10);
    const hasStock = isNaN(qtyNumber) ? true : qtyNumber > 0;
    const secondaryStockCount = isNaN(qtyNumber) ? "" : qtyNumber.toString();
    const alwaysStock = isNaN(qtyNumber) || quantity === "";

    let localProducts = getLocalProducts();
    const existingIndex = localProducts.findIndex((p: any) => p.id === id);

    if (existingIndex !== -1) {
      // Update existing local product
      localProducts[existingIndex] = {
        ...localProducts[existingIndex],
        name,
        price: price || "0",
        hasStock,
        alwaysStock,
        secondaryStockCount,
        extraAttributes: {
          ...localProducts[existingIndex].extraAttributes,
          "Merchant Remark": remarks || "",
          "remarks": remarks || ""
        }
      };
    } else {
      // It was a sheet product. Find it from sheet/backup cache and overwrite
      let sheetProduct = productsCache.find((p: any) => p.id === id);
      if (!sheetProduct && fs.existsSync("products_backup.json")) {
        try {
          const backup = JSON.parse(fs.readFileSync("products_backup.json", "utf-8"));
          sheetProduct = backup.find((p: any) => p.id === id);
        } catch (e) {
          console.error("Failed to read backup for find product:", e);
        }
      }

      const updatedProduct = {
        id,
        name,
        price: price || "0",
        hasStock,
        alwaysStock,
        secondaryStockCount,
        extraAttributes: {
          ...(sheetProduct?.extraAttributes || {}),
          "Merchant Remark": remarks || "",
          "remarks": remarks || ""
        },
        allValues: sheetProduct?.allValues || []
      };

      localProducts.unshift(updatedProduct);
    }

    saveLocalProducts(localProducts);

    // Sync to Google Sheet if enabled
    triggerSheetsSync(id, name, price || "0", quantity, remarks || "", "updateProduct");

    res.json({ success: true, message: "Product updated successfully" });
  } catch (error: any) {
    console.error("Error updating product:", error);
    res.status(500).json({ error: error.message || "Failed to update product" });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "true";
    if (forceRefresh) {
      lastFetchTime = 0; // invalidate memory sheet cache duration lookup
      lastCostFetchTime = 0; // invalidate memory cost cache duration lookup
    }
    const sheetProducts = await fetchProductsFromSheet();
    const localProducts = getLocalProducts();
    
    let costCategories = { symbolToName: {} as Record<string, string>, productIdToSymbol: {} as Record<string, string> };
    try {
      costCategories = await fetchCostCategories();
    } catch (e) {
      console.error("Failed to fetch cost categories:", e);
    }
    
    // Prevent duplicate entries: override any fetched sheet product with its local edited counterpart
    const localIds = new Set(localProducts.map(p => p.id));
    const filteredSheet = sheetProducts.filter(p => !localIds.has(p.id));
    const allRawProducts = [...localProducts, ...filteredSheet];

    // Decorate products with cost tab category symbol and name
    const decoratedProducts = allRawProducts.map((p: any) => {
      const symbol = (costCategories.productIdToSymbol || {})[p.id] || "";
      const name = (costCategories.symbolToName || {})[symbol] || "";
      return {
        ...p,
        costCategorySymbol: symbol,
        costCategoryName: name
      };
    });
    
    res.json({ products: decoratedProducts, costCategories });
  } catch (error) {
    console.error("Get products error:", error);
    res.json({ products: getLocalProducts(), costCategories: { symbolToName: {}, productIdToSymbol: {} } });
  }
});

app.get("/api/uploaded-images", async (req, res) => {
  try {
    if (s3Client && !gcsDisabledDueToBilling) {
      try {
        console.log(`[GCS Sync Client] Listing objects in GCS bucket: ${bucketName}`);
        const command = new ListObjectsV2Command({
          Bucket: bucketName,
        });
        const response = await s3Client.send(command);
        const contents = response.Contents || [];
        
        const images = contents
          .filter((obj: any) => obj.Key && /\.(jpg|jpeg|png|gif|webp)$/i.test(obj.Key))
          .map((obj: any) => ({
            filename: obj.Key,
            size: obj.Size || 0,
            updatedAt: obj.LastModified || new Date(),
          }));
        
        console.log(`[GCS Sync Client] GCS listed ${images.length} files successfully.`);
        return res.json({ images });
      } catch (gcsError: any) {
        handleGcsError(gcsError, "list-images");
      }
    }

    const publicDir = path.join(process.cwd(), "public");
    if (!fs.existsSync(publicDir)) {
      return res.json({ images: [] });
    }
    const files = fs.readdirSync(publicDir);
    const images = files
      .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file))
      .map(file => {
        const filePath = path.join(publicDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          updatedAt: stats.mtime
        };
      });
    res.json({ images });
  } catch (error: any) {
    console.error("List images error:", error);
    res.status(500).json({ error: error.message || "Failed to list images." });
  }
});

app.delete("/api/uploaded-images/:filename", async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename) {
      return res.status(400).json({ error: "Filename is required" });
    }
    const safeFilename = path.basename(filename);
    if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(safeFilename)) {
      return res.status(400).json({ error: "Invalid file type" });
    }

    const publicDir = path.join(process.cwd(), "public");
    const filePath = path.join(publicDir, safeFilename);

    let deletedFromGcs = false;
    if (s3Client && !gcsDisabledDueToBilling) {
      try {
        console.log(`[GCS Sync Client] Deleting from GCS bucket: ${safeFilename}`);
        const command = new DeleteObjectCommand({
          Bucket: bucketName,
          Key: safeFilename,
        });
        await s3Client.send(command);
        deletedFromGcs = true;
        console.log(`[GCS Sync Client] Successfully deleted from GCS: ${safeFilename}`);
      } catch (gcsError: any) {
        handleGcsError(gcsError, "delete-image");
      }
    }

    // Always attempt clean up from local directory too for consistency
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted customer product image locally: ${safeFilename}`);
      return res.json({ success: true, fromGcs: deletedFromGcs });
    } else if (deletedFromGcs) {
      return res.json({ success: true, fromGcs: true });
    } else {
      return res.status(404).json({ error: "File not found" });
    }
  } catch (error: any) {
    console.error("Delete image error:", error);
    res.status(500).json({ error: error.message || "Failed to delete image." });
  }
});

// Smart router to resolve and match product photo files including copy suffixes (like id-XXXX-1.jpg)
app.get(["/:filename", "/products/:filename", "/images/:filename"], async (req, res, next) => {
  const { filename } = req.params;
  
  if (!filename || !/\.(jpg|jpeg|png|gif|webp)$/i.test(filename)) {
    return next();
  }

  // 1. Try Google Cloud Storage first if enabled
  if (s3Client && !gcsDisabledDueToBilling) {
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: filename,
      });
      const s3Response = await s3Client.send(command);
      if (s3Response.Body) {
        res.setHeader("Content-Type", s3Response.ContentType || getMimeType(filename));
        if (s3Response.ContentLength) {
          res.setHeader("Content-Length", s3Response.ContentLength);
        }
        res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache aggressively
        const stream = s3Response.Body as any;
        if (typeof stream.pipe === "function") {
          return stream.pipe(res);
        }
      }
    } catch (gcsError: any) {
      if (gcsError.name !== "NoSuchKey" && gcsError.name !== "NotFound") {
        handleGcsError(gcsError, "fetch-image");
      }
    }
  }

  const publicDir = path.join(process.cwd(), "public");
  
  // Extract clean ID base product name from filename
  const dotIndex = filename.lastIndexOf(".");
  const requestedBaseName = (dotIndex !== -1 ? filename.substring(0, dotIndex) : filename).toLowerCase();

  // 2. Direct try: check if exact file exists in public/ and is non-empty
  const exactPath = path.join(publicDir, filename);
  if (fs.existsSync(exactPath)) {
    const stats = fs.statSync(exactPath);
    if (stats.size > 0) {
      // Background sync accurate local file to GCS
      if (s3Client && !gcsDisabledDueToBilling) {
        fs.readFile(exactPath, (err, data) => {
          if (!err && data && s3Client) {
            const uploadCmd = new PutObjectCommand({
              Bucket: bucketName,
              Key: filename,
              Body: data,
              ContentType: getMimeType(filename),
            });
            s3Client.send(uploadCmd).then(() => {
              console.log(`[GCS Sync Client] Progressively synced local historical file to GCS: ${filename}`);
            }).catch(e => {
              handleGcsError(e, "background-sync-1");
            });
          }
        });
      }
      return res.sendFile(exactPath);
    }
  }

  // 3. Loose try: search files in public list starting with requestedBaseName (e.g. "id-123" matches "id-123-1.jpg")
  try {
    if (fs.existsSync(publicDir)) {
      const files = fs.readdirSync(publicDir);
      const bestMatch = files.find(file => {
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(file)) return false;
        
        const fileDotIndex = file.lastIndexOf(".");
        const fileBaseName = (fileDotIndex !== -1 ? file.substring(0, fileDotIndex) : file).toLowerCase();

        // Matches if it's identical or starts with requested base name plus connector symbol
        if (fileBaseName === requestedBaseName || fileBaseName.startsWith(requestedBaseName + "-") || fileBaseName.startsWith(requestedBaseName + "_")) {
          const filePath = path.join(publicDir, file);
          const stats = fs.statSync(filePath);
          return stats.size > 0;
        }
        return false;
      });

      if (bestMatch) {
        // If bestMatch exists and s3Client is initialized, we can asynchronously upload it to GCS for future instant serving!
        if (s3Client && !gcsDisabledDueToBilling) {
          const localMatchPath = path.join(publicDir, bestMatch);
          fs.readFile(localMatchPath, (err, data) => {
            if (!err && data && s3Client) {
              const uploadCmd = new PutObjectCommand({
                Bucket: bucketName,
                Key: bestMatch,
                Body: data,
                ContentType: getMimeType(bestMatch),
              });
              s3Client.send(uploadCmd).then(() => {
                console.log(`[GCS Sync Client] Progressively synced local historical file to GCS: ${bestMatch}`);
              }).catch(e => {
                handleGcsError(e, "background-sync-2");
              });
            }
          });
        }

        console.log(`Smart matched request "${filename}" -> "${bestMatch}"`);
        return res.sendFile(path.join(publicDir, bestMatch));
      }
    }
  } catch (err) {
    console.error("Dynamic image resolution error:", err);
  }

  return res.status(404).send("Image not found");
});

// Serve static assets from public/assets if needed
app.use(express.static(path.join(process.cwd(), "public")));

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      // If the path contains an extension, it's a static file request (not an HTML route), so return 404
      const ext = path.extname(req.path);
      if (ext && ext !== ".html") {
        return res.status(404).send("Not found");
      }
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
