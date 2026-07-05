import React, { useState, useEffect, useMemo } from "react";
import { jsPDF } from "jspdf";
import { 
  Search, 
  Filter, 
  ShoppingCart, 
  ChevronRight, 
  ChevronLeft, 
  ChevronDown,
  X, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Package, 
  FileText, 
  Plus, 
  Minus, 
  Trash2, 
  Copy, 
  Check, 
  Clock,
  ArrowUpDown,
  SlidersHorizontal,
  Info,
  Upload,
  Image as ImageIcon,
  Folder,
  FolderOpen,
  Edit,
  Sliders,
  Database,
  Save,
  Activity,
  Eye,
  Share,
  Smartphone,
  Settings,
  Download
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: string;
  priceA?: string;
  priceB?: string;
  priceC?: string;
  hasStock: boolean;
  alwaysStock: boolean;
  secondaryStockCount: string;
  extraAttributes: Record<string, string>;
  allValues: string[];
}

interface CartItem {
  product: Product;
  quantity: number;
}

// Background helper to pre-download and cache all valid product images in the browser
const preloadAndCacheAllProducts = async (productsToCache: Product[]) => {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const cache = await caches.open("product-images-v1");
    const chunkSize = 4; // Fetch in small, staggered chunks to prevent UI thread lock or network overload
    for (let i = 0; i < productsToCache.length; i += chunkSize) {
      const chunk = productsToCache.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (p) => {
          const possibleUrls = [
            `/${p.id}.jpg`,
            `/${p.id}.jpeg`,
            `/products/${p.id}.jpg`,
            `/images/${p.id}.jpg`,
            p.extraAttributes?.["Image URLs"]?.trim()
          ].filter(Boolean) as string[];

          for (const url of possibleUrls) {
            try {
              // If already cached, we can bypass to save bandwidth
              const cached = await cache.match(url);
              if (cached) break;

              // Download and cache it
              const isExternal = url.startsWith("http://") || url.startsWith("https://");
              const fetchOptions: RequestInit = isExternal ? { mode: "no-cors" } : {};
              const response = await fetch(url, fetchOptions);
              if (response.ok || isExternal) {
                await cache.put(url, response);
                break; // Found working image for this product, skip other fallbacks
              }
            } catch {
              // Try next fallback extension or URL
            }
          }
        })
      );
      // Wait a tiny moment between chunks to let other browser operations breathe
      await new Promise(resolve => setTimeout(resolve, 60));
    }
  } catch (err) {
    console.warn("Background image preloader encountered an error:", err);
  }
};

// ProductImage component with sequential fallback checking and direct browser cache storage interceptor
const ProductImage: React.FC<{
  id: string;
  name: string;
  fallbackUrl?: string;
  isOutOfStock: boolean;
  version?: number;
}> = ({ id, name, fallbackUrl, isOutOfStock, version = 0 }) => {
  const cleanId = id.replace(/^(id[-_])?/i, "");
  const suffix = version ? `?v=${version}` : "";
  const fallbackRaw = fallbackUrl?.trim() || "";
  const fallbackUrls = useMemo(() => {
    return fallbackRaw.split(/[,\n]/).map(u => u.trim()).filter(Boolean);
  }, [fallbackRaw]);

  const sequentialUrls = useMemo(() => {
    const localPatterns = [
      `/${id}.jpg`,
      `/${id}.jpeg`,
      `/id-${cleanId}.jpg`,
      `/id-${cleanId}.jpeg`,
      `/${cleanId}.jpg`,
      `/${cleanId}.jpeg`,
      `/products/${id}.jpg`,
      `/products/id-${cleanId}.jpg`,
      `/products/${cleanId}.jpg`,
      `/images/${id}.jpg`,
      `/images/id-${cleanId}.jpg`,
      `/images/${cleanId}.jpg`,
    ];
    return [
      ...localPatterns.map(p => `${p}${suffix}`),
      ...fallbackUrls
    ];
  }, [id, cleanId, suffix, fallbackUrls]);

  const [urlIndex, setUrlIndex] = useState<number>(0);
  const [cachedUrl, setCachedUrl] = useState<string>("");

  const imgSrc = sequentialUrls[urlIndex] || "";

  useEffect(() => {
    setUrlIndex(0);
    setCachedUrl("");
  }, [id, version, fallbackUrl]);

  // Intercept cache and load directly as a local Blob to ensure instant offline/cached rendering
  useEffect(() => {
    if (urlIndex >= sequentialUrls.length || !imgSrc) return;
    let active = true;
    let objectUrl = "";

    const checkCache = async () => {
      if (typeof window !== "undefined" && "caches" in window) {
        try {
          const cache = await caches.open("product-images-v1");
          // Match with ignoreSearch option to ignore version params
          let matched = await cache.match(imgSrc, { ignoreSearch: true });
          if (matched && active) {
            // Opaque responses can't be read as blob, so serve them directly from cache via image source URL
            if (matched.type === "opaque") {
              setCachedUrl(imgSrc);
              return;
            }
            try {
              const blob = await matched.blob();
              if (active) {
                objectUrl = URL.createObjectURL(blob);
                setCachedUrl(objectUrl);
                return;
              }
            } catch (blobErr) {
              // Fallback to setting directly, which lets Service Worker handle it offline
              setCachedUrl(imgSrc);
              return;
            }
          }
        } catch (err) {
          console.warn("Cache match failed, serving natively", err);
        }
      }
      if (active) {
        setCachedUrl("");
      }
    };

    checkCache();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [imgSrc, urlIndex, sequentialUrls]);

  const handleImgError = () => {
    if (urlIndex < sequentialUrls.length - 1) {
      setUrlIndex(prev => prev + 1);
    } else {
      setUrlIndex(sequentialUrls.length); // Render fallback placeholder initials
    }
  };

  const handleImgLoad = async () => {
    // Cache the loaded source if loaded natively so it's cached on the device for next time
    if (imgSrc && !cachedUrl && typeof window !== "undefined" && "caches" in window) {
      try {
        const cache = await caches.open("product-images-v1");
        const matched = await cache.match(imgSrc, { ignoreSearch: true });
        if (!matched) {
          const isExternal = imgSrc.startsWith("http://") || imgSrc.startsWith("https://");
          let response: Response | null = null;
          if (isExternal) {
            try {
              response = await fetch(imgSrc); // CORS fetch
            } catch {
              try {
                response = await fetch(imgSrc, { mode: "no-cors" }); // fallback opaque
              } catch {
                // Ignore
              }
            }
          } else {
            response = await fetch(imgSrc);
          }
          if (response && (response.ok || response.status === 0)) {
            await cache.put(imgSrc, response);
          }
        }
      } catch {
        // Silently ignore caching errors
      }
    }
  };

  if (urlIndex >= sequentialUrls.length) {
    const initials = name.trim().slice(0, 3).toUpperCase();
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-slate-100 to-slate-200 text-slate-500 relative transition-all duration-300 overflow-hidden ${isOutOfStock ? "grayscale contrast-75 brightness-90 opacity-40" : ""}`}>
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
        <div className="text-xl font-bold tracking-wider text-slate-600 mb-1 z-10 px-2 text-center break-words line-clamp-2">{initials}</div>
        <span className="text-[10px] text-slate-400 font-mono z-10 uppercase tracking-widest">No local photo</span>
      </div>
    );
  }

  if (!imgSrc) {
    return null;
  }

  return (
    <img
      src={cachedUrl || imgSrc}
      alt={name}
      onError={handleImgError}
      onLoad={handleImgLoad}
      className={`w-full h-full object-cover transition-all duration-500 ${isOutOfStock ? "grayscale contrast-75 brightness-95 opacity-40 bg-slate-50" : "hover:scale-105"}`}
      loading="lazy"
    />
  );
};

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedPriceTier, setSelectedPriceTier] = useState<"A" | "B" | "C">(() => {
    try {
      const saved = localStorage.getItem("selected_price_tier");
      return (saved === "A" || saved === "B" || saved === "C" ? saved : "A");
    } catch {
      return "A";
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [syncTime, setSyncTime] = useState<string>("");
  const [syncing, setSyncing] = useState<boolean>(false);
  
  // Offline monitoring states
  const [isOffline, setIsOffline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? !navigator.onLine : false;
  });
  const [usingOfflineBackup, setUsingOfflineBackup] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // iOS PWA Installation Prompt State
  const [showIosPrompt, setShowIosPrompt] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check if the device is iOS (iPhone/iPad/iPod)
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    // Check if running in standalone display mode (already installed)
    const isPWAStandalone = window.matchMedia('(display-mode: standalone)').matches || 
      (navigator as any).standalone === true;

    // Check if user dismissed the prompt in this browser before
    const isDismissed = localStorage.getItem("ios_install_prompt_dismissed") === "true";

    if (isIOSDevice && !isPWAStandalone && !isDismissed) {
      // Show the beautifully styled iOS install prompt after a short delay
      const timer = setTimeout(() => {
        setShowIosPrompt(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);


  useEffect(() => {
    try {
      localStorage.setItem("selected_price_tier", selectedPriceTier);
    } catch (e) {
      console.warn("Storage access not allowed in this environment:", e);
    }
  }, [selectedPriceTier]);

  const getProductPrice = (product: Product): string => {
    if (selectedPriceTier === "A") return product.priceA || product.price;
    if (selectedPriceTier === "B") return product.priceB || product.price;
    if (selectedPriceTier === "C") return product.priceC || product.price;
    return product.price;
  };

  // View mode and google sheets integration states
  const [viewMode, setViewMode] = useState<"admin" | "customer">(() => {
    try {
      const saved = localStorage.getItem("app_view_mode");
      return (saved === "customer" ? "customer" : "admin");
    } catch (e) {
      console.warn("Storage access not allowed in this environment:", e);
      return "admin";
    }
  });

  const [sheetSettings, setSheetSettings] = useState({ appsScriptUrl: "", enabled: false });
  const [savingSettings, setSavingSettings] = useState(false);
  const [showScriptGuide, setShowScriptGuide] = useState(false);
  const [isSheetSettingsOpen, setIsSheetSettingsOpen] = useState(false);

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedParentCategory, setSelectedParentCategory] = useState<string>("All");
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>("All");
  const [selectedCostCategoryName, setSelectedCostCategoryName] = useState<string>("All");
  const [costCategories, setCostCategories] = useState<{
    symbolToName: Record<string, string>;
    productIdToSymbol: Record<string, string>;
  }>({ symbolToName: {}, productIdToSymbol: {} });
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState<boolean>(false);
  const [isStockDropdownOpen, setIsStockDropdownOpen] = useState<boolean>(false);
  const [stockFilter, setStockFilter] = useState<string>("all"); // 'all' | 'in-stock' | 'out-of-stock' | 'always-stock'
  const [sortKey, setSortKey] = useState<string>("name-asc"); // 'name-asc' | 'price-asc' | 'price-desc' | 'id-asc'
  
  // Pagination States
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(24);

  // Interaction Panel States
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [showOrderSubmitted, setShowOrderSubmitted] = useState<boolean>(false);
  const [copiedQuote, setCopiedQuote] = useState<boolean>(false);

  // Photo Upload States
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [imageVersion, setImageVersion] = useState<number>(Date.now());

  // Toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3000);
  };

  // Offline support & PDF catalog states
  const [cacheProgress, setCacheProgress] = useState<number>(-1); // -1 means not running, 0-100 means percentage
  const [cacheCount, setCacheCount] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [isPreviewingPdfPrint, setIsPreviewingPdfPrint] = useState<boolean>(false);

  // Group products by top category for Catalog and PDF generation
  const productsByCategory = useMemo(() => {
    const groups: Record<string, Product[]> = {};
    products.forEach(p => {
      const rawCat = p.extraAttributes?.["Categories"] || "其他分類 / Uncategorized";
      const cat = rawCat.split("/")[0]?.trim() || "其他分類 / Uncategorized";
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(p);
    });
    return groups;
  }, [products]);

  // One-click background cache downloader with progress tracking
  const handlePrecacheAllImages = async () => {
    if (typeof window === "undefined" || !("caches" in window)) {
      showToast("您的瀏覽器不支援離線快取儲存。");
      return;
    }
    try {
      const cache = await caches.open("product-images-v1");
      const listToCache = [...products];
      if (listToCache.length === 0) {
        showToast("沒有找到可快取的商品。");
        return;
      }
      setCacheCount({ current: 0, total: listToCache.length });
      setCacheProgress(0);
      
      const chunkSize = 5;
      let cachedCount = 0;
      
      for (let i = 0; i < listToCache.length; i += chunkSize) {
        const chunk = listToCache.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (p) => {
            const cleanId = p.id.replace(/^(id[-_])?/i, "");
            const fallbackRaw = p.extraAttributes?.["Image URLs"]?.trim() || "";
            const fallbackUrls = fallbackRaw.split(/[,\n]/).map(u => u.trim()).filter(Boolean);

            const possibleUrls = [
              `/${p.id}.jpg`,
              `/${p.id}.jpeg`,
              `/id-${cleanId}.jpg`,
              `/id-${cleanId}.jpeg`,
              `/${cleanId}.jpg`,
              `/${cleanId}.jpeg`,
              `/products/${p.id}.jpg`,
              `/products/id-${cleanId}.jpg`,
              `/products/${cleanId}.jpg`,
              `/images/${p.id}.jpg`,
              `/images/id-${cleanId}.jpg`,
              `/images/${cleanId}.jpg`,
              ...fallbackUrls
            ].filter(Boolean) as string[];

            for (const url of possibleUrls) {
              try {
                // Use ignoreSearch to skip checking version param differences
                const cached = await cache.match(url, { ignoreSearch: true });
                if (cached) {
                  break;
                }

                const isExternal = url.startsWith("http://") || url.startsWith("https://");
                let response: Response | null = null;
                if (isExternal) {
                  try {
                    response = await fetch(url); // Try standard CORS
                  } catch {
                    try {
                      response = await fetch(url, { mode: "no-cors" }); // Fallback to opaque
                    } catch {
                      // both failed
                    }
                  }
                } else {
                  response = await fetch(url);
                }

                if (response && (response.ok || response.status === 0)) {
                  await cache.put(url, response);
                  break; 
                }
              } catch {
                // Ignore download failure for this option, try next fallback
              }
            }
            cachedCount++;
          })
        );
        
        const progressPercentage = Math.round((cachedCount / listToCache.length) * 100);
        setCacheProgress(progressPercentage);
        setCacheCount({ current: cachedCount, total: listToCache.length });
        
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      showToast(`成功快取 ${listToCache.length} 款商品的圖片，現已支援完全離線瀏覽！`);
      setTimeout(() => setCacheProgress(-1), 2000);
    } catch (err) {
      console.error("Precache failed:", err);
      showToast("下載圖片快取時發生錯誤。");
      setCacheProgress(-1);
    }
  };

  // Programmatic PDF Exporter (jsPDF) with Outline Bookmarks of categories
  const handleGenerateJsPdf = async () => {
    try {
      setIsGeneratingPdf(true);
      showToast("正在下載中文字型並準備 PDF 目錄...");
      
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      let fontAdded = false;
      try {
        const fontUrl = "https://cdn.jsdelivr.net/npm/noto-sans-tc-subset@1.0.0/NotoSansTC-Regular.ttf";
        const res = await fetch(fontUrl);
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64Font = window.btoa(binary);
          
          doc.addFileToVFS("NotoSansTC-Regular.ttf", base64Font);
          doc.addFont("NotoSansTC-Regular.ttf", "NotoSansTC", "normal");
          doc.setFont("NotoSansTC");
          fontAdded = true;
          console.log("NotoSansTC font loaded inside jsPDF successfully.");
        }
      } catch (err) {
        console.warn("Could not fetch subset Chinese font offline, using Helvetica fallback", err);
      }

      if (!fontAdded) {
        doc.setFont("helvetica", "normal");
      }

      // 1. Cover Page
      doc.setFillColor(15, 23, 42); // slate-900 background
      doc.rect(0, 0, 210, 297, "F");

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(26);
      doc.text(fontAdded ? "商品目錄" : "PRODUCT CATALOG", 105, 100, { align: "center" });

      doc.setFontSize(14);
      doc.setTextColor(226, 232, 240); // slate-200
      doc.text(`Price Tier: ${selectedPriceTier} 系列`, 105, 120, { align: "center" });

      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184); // slate-400
      const nowStr = new Date().toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
      doc.text(`產出日期: ${nowStr} | 共 ${products.length} 款商品`, 105, 240, { align: "center" });
      doc.text("支援完全離線查閱，隨時隨地，快速詢價", 105, 250, { align: "center" });

      // Create outline bookmarks root
      const outline = doc.outline;
      let categoriesParent = null;
      if (outline) {
        categoriesParent = outline.add(null, fontAdded ? "商品分類" : "Categories", { pageNumber: 1 });
      }

      // 2. Loop categories and list products
      const cats = Object.keys(productsByCategory);
      let pageNum = 1;

      cats.forEach((catName, catIdx) => {
        doc.addPage();
        pageNum++;

        if (outline && categoriesParent) {
          outline.add(categoriesParent, catName, { pageNumber: pageNum });
        }

        // Category Page style
        doc.setFillColor(248, 250, 252); // slate-50
        doc.rect(0, 0, 210, 25, "F");

        doc.setFillColor(79, 70, 229); // indigo-600
        doc.rect(15, 8, 3, 10, "F");

        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42); // slate-900
        doc.text(catName, 22, 16);

        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139); // slate-500
        doc.text(`分類編號: ${catIdx + 1} | 頁碼: ${pageNum}`, 195, 15, { align: "right" });

        // Table Header
        let y = 38;
        doc.setFillColor(241, 245, 249); // slate-100
        doc.rect(15, y - 5, 180, 8, "F");

        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105); // slate-600
        doc.text("編號 / ID", 18, y);
        doc.text("商品名稱 / Name", 45, y);
        doc.text("單價 / Price", 145, y, { align: "right" });
        doc.text("庫存 / Stock", 180, y, { align: "center" });

        y += 8;

        const catProds = productsByCategory[catName];
        catProds.forEach((p, idx) => {
          if (y > 270) {
            doc.addPage();
            pageNum++;
            
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, 210, 20, "F");
            doc.setFontSize(11);
            doc.setTextColor(15, 23, 42);
            doc.text(`${catName} (續)`, 15, 13);
            doc.setFontSize(9);
            doc.text(`頁碼: ${pageNum}`, 195, 13, { align: "right" });

            // Table Header on new page
            y = 30;
            doc.setFillColor(241, 245, 249);
            doc.rect(15, y - 5, 180, 8, "F");
            doc.setTextColor(71, 85, 105);
            doc.text("編號 / ID", 18, y);
            doc.text("商品名稱 / Name", 45, y);
            doc.text("單價 / Price", 145, y, { align: "right" });
            doc.text("庫存 / Stock", 180, y, { align: "center" });
            
            y += 8;
          }

          // Row background alternation
          if (idx % 2 === 1) {
            doc.setFillColor(250, 250, 250);
            doc.rect(15, y - 4, 180, 6.5, "F");
          }

          doc.setFontSize(8.5);
          doc.setTextColor(15, 23, 42);

          // ID
          doc.text(p.id, 18, y);

          // Name (truncate for safe padding alignment)
          const maxNameLen = fontAdded ? 25 : 35;
          let displayName = p.name;
          if (displayName.length > maxNameLen) {
            displayName = displayName.substring(0, maxNameLen) + "...";
          }
          doc.text(displayName, 45, y);

          // Price
          const priceVal = parseFloat(getProductPrice(p));
          let priceStr = "詢價決定";
          if (priceVal > 0) {
            priceStr = `HK$${priceVal.toFixed(2)}`;
          }
          doc.text(priceStr, 145, y, { align: "right" });

          // Stock status
          let stockStr = "有現貨";
          if (p.alwaysStock) {
            stockStr = "長期充足";
          } else if (!p.hasStock) {
            stockStr = "無現貨";
          }
          doc.text(stockStr, 180, y, { align: "center" });

          y += 6.5;
        });
      });

      doc.save(`Product_Catalog_Price_Tier_${selectedPriceTier}.pdf`);
      showToast("PDF 商品目錄導出成功！");
    } catch (error) {
      console.error("PDF export failed:", error);
      showToast("PDF 導出失敗。");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Photo List and Queue Management
  const [uploadFiles, setUploadFiles] = useState<{
    id: string;
    file: File;
    status: "pending" | "uploading" | "success" | "error";
    error?: string;
    mappedProductId: string;
  }[]>([]);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Server directory stats and file listings state
  const [serverImages, setServerImages] = useState<{ filename: string; size: number; updatedAt: string }[]>([]);
  const [loadingServerImages, setLoadingServerImages] = useState<boolean>(false);
  const [isFolderExplorerOpen, setIsFolderExplorerOpen] = useState<boolean>(false);
  const [folderSearchQuery, setFolderSearchQuery] = useState<string>("");

  // Add Product Form States
  const [isAddProductOpen, setIsAddProductOpen] = useState<boolean>(false);
  const [newProductId, setNewProductId] = useState<string>("");
  const [newProductName, setNewProductName] = useState<string>("");
  const [newProductPrice, setNewProductPrice] = useState<string>("");
  const [newProductQuantity, setNewProductQuantity] = useState<string>("");
  const [newProductRemarks, setNewProductRemarks] = useState<string>("");
  const [newProductImageFile, setNewProductImageFile] = useState<File | null>(null);
  const [newProductImagePreview, setNewProductImagePreview] = useState<string>("");
  const [isSubmittingProduct, setIsSubmittingProduct] = useState<boolean>(false);

  // Edit Product States
  const [isEditingSelectedProduct, setIsEditingSelectedProduct] = useState<boolean>(false);
  const [editProductName, setEditProductName] = useState<string>("");
  const [editProductPrice, setEditProductPrice] = useState<string>("");
  const [editProductQuantity, setEditProductQuantity] = useState<string>("");
  const [editProductRemarks, setEditProductRemarks] = useState<string>("");
  const [editProductImageFile, setEditProductImageFile] = useState<File | null>(null);
  const [editProductImagePreview, setEditProductImagePreview] = useState<string>("");
  const [isUpdatingProduct, setIsUpdatingProduct] = useState<boolean>(false);

  const totalStorageSize = useMemo(() => {
    return serverImages.reduce((sum, img) => sum + img.size, 0);
  }, [serverImages]);

  const fetchServerImages = async () => {
    try {
      setLoadingServerImages(true);
      const res = await fetch("/api/uploaded-images");
      if (res.ok) {
        const data = await res.json();
        setServerImages(data.images || []);
      }
    } catch (err) {
      console.error("Error fetching uploaded files:", err);
    } finally {
      setLoadingServerImages(false);
    }
  };

  const deleteServerImage = async (filename: string) => {
    if (!window.confirm(`Are you sure you want to delete ${filename} from server storage?`)) {
      return;
    }
    try {
      const res = await fetch(`/api/uploaded-images/${encodeURIComponent(filename)}`, {
        method: "DELETE"
      });
      if (res.ok) {
        showToast(`Deleted ${filename} successfully`);
        fetchServerImages();
        setImageVersion(Date.now());
      } else {
        const data = await res.json();
        showToast(`Failed: ${data.error || "Could not delete"}`);
      }
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Error deleting photo");
    }
  };

  const addFilesToQueue = (files: File[]) => {
    const normalizeId = (idStr: string) => {
      return idStr
        .toLowerCase()
        .replace(/^(id[-_])?/i, "")   // remove leading id- or id_
        .replace(/[-_]\d+$/, "")      // remove trailing copy numbers/indexes (e.g. -1, _2)
        .replace(/\s*\(\d+\)$/, "")   // remove trailing copy formats (e.g. (1))
        .trim();
    };

    const newItems = files.map(file => {
      const lastDot = file.name.lastIndexOf(".");
      const nameWithoutExt = lastDot !== -1 ? file.name.substring(0, lastDot).trim() : file.name.trim();
      const fileIdNormalized = normalizeId(nameWithoutExt);
      
      const matched = products.find(p => {
        const productNormalized = normalizeId(p.id);
        return productNormalized === fileIdNormalized || p.id.toLowerCase() === nameWithoutExt.toLowerCase();
      });
      
      return {
        id: Math.random().toString(36).substring(2, 9),
        file,
        status: "pending" as const,
        mappedProductId: matched ? matched.id : ""
      };
    });
    setUploadFiles(prev => [...prev, ...newItems]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFilesToQueue(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer?.files) {
      addFilesToQueue(Array.from(e.dataTransfer.files));
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const startUpload = async () => {
    const itemsToUpload = uploadFiles.filter(item => item.status === "pending" || item.status === "error");
    if (itemsToUpload.length === 0) return;

    // Transition statuses to uploading
    setUploadFiles(prev => prev.map(item => {
      if (item.status === "pending" || item.status === "error") {
        return { ...item, status: "uploading" };
      }
      return item;
    }));

    for (const item of itemsToUpload) {
      if (!item.mappedProductId) {
        setUploadFiles(prev => prev.map(u => u.id === item.id ? { 
          ...u, 
          status: "error", 
          error: "No product assigned." 
        } : u));
        continue;
      }

      try {
        const base64 = await readFileAsBase64(item.file);
        const lastDot = item.file.name.lastIndexOf(".");
        const ext = lastDot !== -1 ? item.file.name.substring(lastDot) : ".jpg";
        
        const filename = `${item.mappedProductId}${ext}`;

        const res = await fetch("/api/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, base64 })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to transfer file.");
        }

        setUploadFiles(prev => prev.map(u => u.id === item.id ? { ...u, status: "success" } : u));
      } catch (err: any) {
        setUploadFiles(prev => prev.map(u => u.id === item.id ? { 
          ...u, 
          status: "error", 
          error: err.message || "Transfer error." 
        } : u));
      }
    }

    // Bump cache busting version token to reload newly loaded assets
    setImageVersion(Date.now());
    fetchServerImages();
    showToast("Product images updated successfully!");
  };

  const removeQueueItem = (id: string) => {
    setUploadFiles(prev => prev.filter(item => item.id !== id));
  };

  const clearQueue = () => {
    setUploadFiles([]);
  };

  const handleProductImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewProductImageFile(file);
      try {
        const base64 = await readFileAsBase64(file);
        setNewProductImagePreview(base64);
      } catch (err) {
        console.error("Error reading image preview:", err);
        showToast("Error loading image preview");
      }
    }
  };

  const handleAddProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) {
      showToast("Please enter a product name!");
      return;
    }

    try {
      setIsSubmittingProduct(true);
      
      const payload = {
        id: newProductId.trim(),
        name: newProductName.trim(),
        price: newProductPrice.trim() || "0",
        quantity: newProductQuantity.trim(),
        remarks: newProductRemarks.trim(),
        base64Image: newProductImagePreview
      };

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create product");
      }

      showToast(`Product "${newProductName.substring(0, 15)}..." added successfully!`);
      setIsAddProductOpen(false);
      
      // Reset form
      setNewProductId("");
      setNewProductName("");
      setNewProductPrice("");
      setNewProductQuantity("");
      setNewProductRemarks("");
      setNewProductImageFile(null);
      setNewProductImagePreview("");
      
      // Reload products catalog of the grid instantly
      await loadProducts(true);
      await fetchServerImages();
      setImageVersion(Date.now());
    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || "Failed to add product"}`);
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const handleEditProductImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEditProductImageFile(file);
      try {
        const base64 = await readFileAsBase64(file);
        setEditProductImagePreview(base64);
      } catch (err) {
        console.error("Error reading edit image preview:", err);
        showToast("Error loading edit image preview");
      }
    }
  };

  const handleUpdateProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    if (!editProductName.trim()) {
      showToast("Product name cannot be empty!");
      return;
    }

    try {
      setIsUpdatingProduct(true);
      
      const payload = {
        id: selectedProduct.id,
        name: editProductName.trim(),
        price: editProductPrice.trim() || "0",
        quantity: editProductQuantity.trim(),
        remarks: editProductRemarks.trim(),
        base64Image: editProductImagePreview.startsWith("data:image") ? editProductImagePreview : undefined
      };

      const res = await fetch(`/api/products/${selectedProduct.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update product");
      }

      showToast(`Product "${editProductName.substring(0, 15)}..." updated successfully!`);
      setIsEditingSelectedProduct(false);
      
      // Reload products catalog of the grid instantly
      await loadProducts(true);
      await fetchServerImages();
      setImageVersion(Date.now());

      // Update the selection as well
      const qtyNumber = parseInt(editProductQuantity.trim(), 10);
      const hasStock = isNaN(qtyNumber) ? true : qtyNumber > 0;
      setSelectedProduct({
        ...selectedProduct,
        name: editProductName.trim(),
        price: editProductPrice.trim() || "0",
        hasStock: hasStock,
        alwaysStock: isNaN(qtyNumber) || editProductQuantity.trim() === "",
        secondaryStockCount: isNaN(qtyNumber) ? "" : qtyNumber.toString(),
        extraAttributes: {
          ...selectedProduct.extraAttributes,
          "Merchant Remark": editProductRemarks.trim(),
          "remarks": editProductRemarks.trim()
        }
      });
    } catch (err: any) {
      console.error(err);
      showToast(`Error: ${err.message || "Failed to update product"}`);
    } finally {
      setIsUpdatingProduct(false);
    }
  };

  const handleStartEditing = () => {
    if (!selectedProduct) return;
    setEditProductName(selectedProduct.name);
    setEditProductPrice(selectedProduct.price);
    setEditProductQuantity(selectedProduct.alwaysStock ? "" : (selectedProduct.secondaryStockCount || ""));
    setEditProductRemarks(selectedProduct.extraAttributes?.["Merchant Remark"] || selectedProduct.extraAttributes?.["remarks"] || "");
    setEditProductImageFile(null);
    setEditProductImagePreview(""); // resets preview
    setIsEditingSelectedProduct(true);
  };

  // Fetch products from our api route
  const loadProducts = async (forceRefresh = false) => {
    try {
      setSyncing(true);
      setError(null);
      const url = forceRefresh ? "/api/products?refresh=true" : "/api/products";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to load product data (${res.statusText})`);
      }
      const data = await res.json();
      if (data.products) {
        // Safe client-side deduplication by ID, ensuring perfect uniquely-keyed rendering
        const uniqueProducts: any[] = [];
        const seenIds = new Set<string>();
        for (const p of data.products) {
          if (p && p.id && !seenIds.has(p.id)) {
            seenIds.add(p.id);
            uniqueProducts.push(p);
          }
        }
        setProducts(uniqueProducts);
        setUsingOfflineBackup(false);

        // Cache in localStorage for offline availability
        try {
          localStorage.setItem("cached_products", JSON.stringify(uniqueProducts));
          if (data.costCategories) {
            localStorage.setItem("cached_cost_categories", JSON.stringify(data.costCategories));
          }
          localStorage.setItem("cached_sync_time", new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } catch (e) {
          console.warn("Storage write failed (offline caching skipped):", e);
        }

        // Start pre-downloading and caching images to device in the background
        preloadAndCacheAllProducts(uniqueProducts);
        if (data.costCategories) {
          setCostCategories(data.costCategories);
        }
        setSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      } else {
        throw new Error("Invalid format returned by server");
      }
    } catch (err: any) {
      console.warn("Fetching latest sheets products failed, attempting local cache fallback:", err);
      try {
        const cachedProductsStr = localStorage.getItem("cached_products");
        const cachedCostStr = localStorage.getItem("cached_cost_categories");
        const cachedSyncTimeStr = localStorage.getItem("cached_sync_time");

        if (cachedProductsStr) {
          const parsedProducts = JSON.parse(cachedProductsStr);
          setProducts(parsedProducts);
          setUsingOfflineBackup(true);
          if (cachedCostStr) {
            setCostCategories(JSON.parse(cachedCostStr));
          }
          if (cachedSyncTimeStr) {
            setSyncTime(cachedSyncTimeStr + " (離線快照)");
          } else {
            setSyncTime("離線模式");
          }
          // Do not show full-screen error if we recovered successfully
          setLoading(false);
          setSyncing(false);
          return;
        }
      } catch (fallbackErr) {
        console.error("Local storage recovery failed:", fallbackErr);
      }
      setError(err.message || "Something went wrong while fetching products.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadProducts();
    fetchServerImages();

    // Fetch Google Sheets Sync settings
    fetch("/api/sheet-settings")
      .then(res => {
        if (res.ok) return res.json();
        throw new Error("Failed to load sheet settings");
      })
      .then(data => {
        if (data) {
          setSheetSettings(data);
          try {
            localStorage.setItem("cached_sheet_settings", JSON.stringify(data));
          } catch (e) {
            console.warn(e);
          }
        }
      })
      .catch(err => {
        console.warn("Sheet settings fetch failed, checking local cache", err);
        try {
          const cached = localStorage.getItem("cached_sheet_settings");
          if (cached) {
            setSheetSettings(JSON.parse(cached));
          }
        } catch (e) {
          console.error(e);
        }
      });

    // Load existing cart if stored
    try {
      const stored = localStorage.getItem("catalog_cart");
      if (stored) {
        setCart(JSON.parse(stored));
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Save cart to local storage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem("catalog_cart", JSON.stringify(cart));
    } catch (e) {
      console.error(e);
    }
  }, [cart]);

  // Persist viewMode
  useEffect(() => {
    try {
      localStorage.setItem("app_view_mode", viewMode);
    } catch (e) {
      console.warn("Could not save viewMode to storage:", e);
    }
  }, [viewMode]);

  const handleSaveSheetSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
       setSavingSettings(true);
       const res = await fetch("/api/sheet-settings", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(sheetSettings)
       });
       if (!res.ok) {
         throw new Error("Failed to save settings");
       }
       showToast("Google Sheet Sync settings updated!");
       setIsSheetSettingsOpen(false);
     } catch (err: any) {
       showToast("Sync config error: " + err.message);
     } finally {
       setSavingSettings(false);
     }
  };

  // Extract categorizations dynamically from loaded products
  const categoryStructure = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    products.forEach(p => {
      const rawCat = p.extraAttributes["Categories"] || "";
      if (rawCat.trim() === "") {
        if (!map["Other"]) map["Other"] = new Set<string>();
        map["Other"].add("Uncategorized");
        return;
      }
      const parts = rawCat.split("/").map(s => s.trim());
      const parent = parts[0] || "Other";
      const sub = parts.slice(1).join(" / ") || "General";

      if (!map[parent]) {
        map[parent] = new Set<string>();
      }
      map[parent].add(sub);
    });

    // Convert sets to sorted arrays
    const sortedMap: Record<string, string[]> = {};
    Object.keys(map).forEach(parent => {
      sortedMap[parent] = Array.from(map[parent]).sort();
    });
    return sortedMap;
  }, [products]);

  // Main category keys sorted by frequency or alphabet (We will sort by count descending)
  const topCategories = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach(p => {
      const rawCat = p.extraAttributes["Categories"] || "";
      const parent = rawCat.split("/")[0]?.trim() || "Other";
      counts[parent] = (counts[parent] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [products]);

  // Reset subcategory if parent changing
  const handleParentCategoryChange = (parent: string) => {
    setSelectedParentCategory(parent);
    setSelectedSubCategory("All");
    setCurrentPage(1);
  };

  // Filtered and Sorted Products
  const processedProducts = useMemo(() => {
    let result = [...products];

    // 1. Search Query Filter
    if (searchQuery.trim() !== "") {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.id.toLowerCase().includes(query) ||
        (p.extraAttributes["Categories"] || "").toLowerCase().includes(query) ||
        (p.extraAttributes["Hashtags"] || "").toLowerCase().includes(query) ||
        (p.extraAttributes["Merchant Remark"] || "").toLowerCase().includes(query)
      );
    }

    // 2. Category Filter
    if (selectedParentCategory !== "All") {
      result = result.filter(p => {
        const rawCat = p.extraAttributes["Categories"] || "";
        const parent = rawCat.split("/")[0]?.trim() || "Other";
        
        if (parent !== selectedParentCategory) return false;

        if (selectedSubCategory !== "All") {
          const sub = rawCat.split("/").slice(1).join(" / ")?.trim() || "General";
          return sub === selectedSubCategory;
        }
        return true;
      });
    }

    // 3. Stock Status Filter
    if (stockFilter === "in-stock") {
      result = result.filter(p => p.hasStock);
    } else if (stockFilter === "out-of-stock") {
      result = result.filter(p => !p.hasStock);
    } else if (stockFilter === "always-stock") {
      result = result.filter(p => p.alwaysStock);
    } else if (stockFilter === "zero-stock") {
      result = result.filter(p => {
        if (p.allValues && p.allValues.length > 28) {
          const ab = (p.allValues[27] || "").trim();
          const ac = (p.allValues[28] || "").trim();
          return ab === "0" && ac === "0";
        }
        return !p.alwaysStock && p.secondaryStockCount === "0";
      });
    }

    // 3.5 Cost Category Filter (from Col F of Cost tab)
    if (selectedCostCategoryName !== "All") {
      result = result.filter(p => p.costCategoryName === selectedCostCategoryName);
    }

    // 4. Sorting
    result.sort((a, b) => {
      const priceA = parseFloat(getProductPrice(a)) || 0;
      const priceB = parseFloat(getProductPrice(b)) || 0;

      switch (sortKey) {
        case "name-asc":
          return a.name.localeCompare(b.name, "zh-HK");
        case "price-asc":
          // Keep 0 price at the end or handle it gracefully
          if (priceA === 0) return 1;
          if (priceB === 0) return -1;
          return priceA - priceB;
        case "price-desc":
          return priceB - priceA;
        case "id-asc":
          return a.id.localeCompare(b.id);
        default:
          return 0;
      }
    });

    return result;
  }, [products, searchQuery, selectedParentCategory, selectedSubCategory, stockFilter, sortKey, selectedCostCategoryName, selectedPriceTier]);

  // Page Calculations
  const totalPages = 1;
  const paginatedProducts = useMemo(() => {
    return processedProducts;
  }, [processedProducts]);

  // Adjust page index if filters result in fewer pages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // Cart operations
  const addToCart = (product: Product, quantity = 1) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.product.id === product.id 
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    showToast(`Added ${product.name.substring(0, 15)}... to Inquiry List!`);
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev => prev.map(item => 
      item.product.id === productId ? { ...item, quantity } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
    showToast("Item removed from list");
  };

  const clearCart = () => {
    setCart([]);
    showToast("Inquiry list cleared");
  };

  // Generate WhatsApp / Email inquiry compile string
  const compileQuoteText = useMemo(() => {
    if (cart.length === 0) return "";
    let txt = "📋 PRODUCT STOCK & PRICE INQUIRY\n";
    txt += "===================================\n";
    let totalValue = 0;
    cart.forEach((item, idx) => {
      const price = parseFloat(getProductPrice(item.product)) || 0;
      const subtotal = price * item.quantity;
      totalValue += subtotal;
      txt += `${idx + 1}. [${item.product.id}]\n`;
      txt += `   Name: ${item.product.name}\n`;
      txt += `   Price: ${price > 0 ? "HK$" + price.toFixed(2) : "Inquire (Price $0)"}\n`;
      txt += `   Qty: ${item.quantity} | Subtotal: ${price > 0 ? "HK$" + subtotal.toFixed(2) : "TBD"}\n`;
      txt += `   Stock Status: ${item.product.alwaysStock ? "Always Stocked" : "Qty: " + item.product.secondaryStockCount}\n`;
      txt += `-----------------------------------\n`;
    });
    txt += `💰 ESTIMATED TOTAL: HK$${totalValue.toFixed(2)}\n`;
    txt += "===================================\n";
    txt += `Generated on: ${new Date().toLocaleString()}\n`;
    txt += `Please confirm stock availability and final quotation. Thank you!`;
    return txt;
  }, [cart, selectedPriceTier]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(compileQuoteText);
    setCopiedQuote(true);
    showToast("Inquiry details copied to clipboard!");
    setTimeout(() => setCopiedQuote(false), 2500);
  };

  const totalCartPrice = useMemo(() => {
    return cart.reduce((total, item) => {
      const price = parseFloat(getProductPrice(item.product)) || 0;
      return total + (price * item.quantity);
    }, 0);
  }, [cart, selectedPriceTier]);

  const totalCartCount = useMemo(() => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  }, [cart]);

  return (
    <div id="app-root" className="min-h-screen bg-[#f8fafc] text-indigo-950 font-sans antialiased text-sm">
      {/* Dynamic Toast Portal */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-800 text-white px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-3 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="font-medium text-xs tracking-wide">{toastMessage}</span>
        </div>
      )}

      {viewMode === "admin" ? (
        <>
          {/* Admin Header */}
          <header id="admin-header" className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 z-30 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
              
              {/* Logo & Connected Title */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-200">
                  <Settings className="w-5 h-5 text-white animate-spin-slow" style={{ animationDuration: '12s' }} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-bold text-base text-slate-900 tracking-tight leading-none md:text-lg">
                      Salestable
                    </h1>
                    {syncTime && (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5" title="最後刷新時間">
                        最後刷新: {syncTime}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-indigo-650 font-bold block mt-1">
                    Google 表格實時同步
                  </span>
                </div>
              </div>

              {/* Present Catalog button! Prominent as requested */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setViewMode("customer")}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-100 flex items-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] animate-pulse hover:animate-none"
                  title="展示用戶端商品圖冊和詢價下單流程"
                >
                  <Eye className="w-4 h-4 text-white" />
                  <span>向客戶展示產品目錄</span>
                </button>
              </div>

            </div>
          </header>

          <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 lg:py-8 space-y-6">
            {/* Quick Stats Summary row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-fadeIn">
              {/* Card 1: 目錄商品總數 */}
              <button
                onClick={() => {
                  setStockFilter("all");
                  setCurrentPage(1);
                }}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                  stockFilter === "all"
                    ? "bg-slate-900 text-white border-slate-900 shadow-md scale-[1.02]"
                    : "bg-white text-slate-900 border-slate-100 hover:border-slate-300 hover:shadow-xs"
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wider font-bold block ${stockFilter === "all" ? "text-slate-300" : "text-slate-400"}`}>目錄商品總數</span>
                <span className="text-2xl font-black mt-1 block">{products.length}</span>
                <span className={`text-[10px] block mt-1.5 font-medium ${stockFilter === "all" ? "text-slate-400" : "text-slate-500"}`}>
                  {stockFilter === "all" ? "✓ 正在篩選全部" : "點擊篩選全部"}
                </span>
              </button>

              {/* Card 2: 有現貨 */}
              <button
                onClick={() => {
                  setStockFilter("in-stock");
                  setCurrentPage(1);
                }}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                  stockFilter === "in-stock"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm scale-[1.02]"
                    : "bg-white text-slate-900 border-slate-100 hover:border-slate-300 hover:shadow-xs"
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wider font-bold block ${stockFilter === "in-stock" ? "text-emerald-600" : "text-slate-400"}`}>有現貨</span>
                <span className={`text-2xl font-black mt-1 block ${stockFilter === "in-stock" ? "text-emerald-700" : "text-emerald-600"}`}>
                  {products.filter(p => p.hasStock).length}
                </span>
                <span className={`text-[10px] block mt-1.5 font-medium ${stockFilter === "in-stock" ? "text-emerald-600" : "text-slate-500"}`}>
                  {stockFilter === "in-stock" ? "✓ 正在篩選有現貨" : "點擊篩選有現貨"}
                </span>
              </button>

              {/* Card 3: 長期充足 */}
              <button
                onClick={() => {
                  setStockFilter("always-stock");
                  setCurrentPage(1);
                }}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                  stockFilter === "always-stock"
                    ? "bg-indigo-50 border-indigo-500 text-indigo-900 shadow-sm scale-[1.02]"
                    : "bg-white text-slate-900 border-slate-100 hover:border-slate-300 hover:shadow-xs"
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wider font-bold block ${stockFilter === "always-stock" ? "text-indigo-600" : "text-slate-400"}`}>長期充足</span>
                <span className={`text-2xl font-black mt-1 block ${stockFilter === "always-stock" ? "text-indigo-700" : "text-indigo-600"}`}>
                  {products.filter(p => p.alwaysStock).length}
                </span>
                <span className={`text-[10px] block mt-1.5 font-medium ${stockFilter === "always-stock" ? "text-indigo-600" : "text-slate-500"}`}>
                  {stockFilter === "always-stock" ? "✓ 正在篩選長期充足" : "點擊篩選長期充足"}
                </span>
              </button>

              {/* Card 4: 缺貨產品 */}
              <button
                onClick={() => {
                  setStockFilter("zero-stock");
                  setCurrentPage(1);
                }}
                className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                  stockFilter === "zero-stock"
                    ? "bg-rose-50 border-rose-400 text-rose-900 shadow-sm scale-[1.02]"
                    : "bg-white text-slate-900 border-slate-100 hover:border-slate-300 hover:shadow-xs"
                }`}
              >
                <span className={`text-[10px] uppercase tracking-wider font-bold block ${stockFilter === "zero-stock" ? "text-rose-600" : "text-slate-400"}`}>缺貨產品</span>
                <span className={`text-2xl font-black mt-1 block ${stockFilter === "zero-stock" ? "text-rose-750" : "text-rose-600"}`}>
                  {products.filter(p => {
                    if (p.allValues && p.allValues.length > 28) {
                      const ab = (p.allValues[27] || "").trim();
                      const ac = (p.allValues[28] || "").trim();
                      return ab === "0" && ac === "0";
                    }
                    return !p.alwaysStock && p.secondaryStockCount === "0";
                  }).length}
                </span>
                <span className={`text-[10px] block mt-1.5 font-medium ${stockFilter === "zero-stock" ? "text-rose-600" : "text-slate-500"}`}>
                  {stockFilter === "zero-stock" ? "✓ 正在篩選缺貨產品" : "點擊篩選缺貨 (Col AB & AC = 0)"}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
              
              {/* Left Column: Operations Suite + Dashboard Statistics */}
              <div className="space-y-6 lg:col-span-1 animate-fadeIn">
                
                {/* Operations Suite */}
                <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3">
                  <div className="flex items-center gap-2 text-indigo-900 mb-2">
                    <Activity className="w-4 h-4 text-indigo-600" />
                    <h3 className="font-extrabold text-sm tracking-tight text-slate-900">操作控制套件</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setNewProductId(`id-${Math.floor(1000000000000000 + Math.random() * 9000000000000000)}`);
                        setNewProductName("");
                        setNewProductPrice("");
                        setNewProductQuantity("");
                        setNewProductRemarks("");
                        setNewProductImageFile(null);
                        setNewProductImagePreview("");
                        setIsAddProductOpen(true);
                      }}
                      className="p-3 text-left rounded-xl border border-slate-100 hover:border-indigo-100 bg-slate-50 hover:bg-indigo-50/20 text-slate-800 transition-all flex flex-col gap-1 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-[11px] block mt-1 text-slate-900">新增商品</span>
                      <span className="text-[9px] text-slate-400 font-medium font-bold">建立本地自訂 SKU</span>
                    </button>

                    <button
                      onClick={() => setIsUploadOpen(true)}
                      className="p-3 text-left rounded-xl border border-slate-100 hover:border-indigo-100 bg-slate-50 hover:bg-indigo-50/20 text-slate-800 transition-all flex flex-col gap-1 cursor-pointer"
                    >
                      <Upload className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-[11px] block mt-1 text-slate-900">批次傳圖</span>
                      <span className="text-[9px] text-slate-400 font-medium font-bold">批次上傳商品圖片</span>
                    </button>

                    <button
                      onClick={() => setIsFolderExplorerOpen(true)}
                      className="p-3 text-left rounded-xl border border-slate-100 hover:border-indigo-100 bg-slate-50 hover:bg-indigo-50/20 text-slate-800 transition-all flex flex-col gap-1 cursor-pointer"
                    >
                      <FolderOpen className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold text-[11px] block mt-1 text-slate-900">瀏覽相片庫</span>
                      <span className="text-[9px] text-slate-400 font-medium font-bold">管理上傳的靜態資源相片</span>
                    </button>

                    <button
                      onClick={() => loadProducts(true)}
                      disabled={syncing}
                      className="p-3 text-left rounded-xl border border-slate-100 hover:border-indigo-100 bg-slate-50 hover:bg-indigo-50/20 text-slate-800 transition-all flex flex-col gap-1 disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 text-indigo-600 ${syncing ? "animate-spin" : ""}`} />
                      <span className="font-bold text-[11px] block mt-1 text-slate-900">強制同步表格</span>
                      <span className="text-[9px] text-slate-400 font-medium font-bold">重新獲取 Google Sheets 資料</span>
                    </button>

                    <button
                      onClick={() => setIsSheetSettingsOpen(true)}
                      className="col-span-2 p-3 text-left rounded-xl border border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/20 hover:bg-indigo-50/40 text-slate-800 transition-all flex items-center gap-3 cursor-pointer"
                    >
                      <Database className="w-5 h-5 text-indigo-600 shrink-0" />
                      <div>
                        <span className="font-bold text-[11px] block text-slate-900">Google Sheets 連接同步設置</span>
                        <span className="text-[9px] text-slate-400 font-medium font-bold">配置實時同步與 Apps Script 設置</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Folder Storage Explorer Disk Card */}
                <div 
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                      addFilesToQueue(Array.from(e.dataTransfer.files));
                      setIsUploadOpen(true);
                    }
                  }}
                  className={`bg-gradient-to-br from-amber-50 to-orange-50/50 rounded-2xl border ${isDragOver ? "border-amber-400 ring-2 ring-amber-350" : "border-amber-100 hover:border-amber-200"} p-5 shadow-sm space-y-4 transition-all relative overflow-hidden group`}
                >
                  {/* Backlight / Folder Accent effect */}
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-200/20 rounded-full blur-xl -mr-6 -mt-6"></div>
                  
                  <div className="flex items-start justify-between relative z-10">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shadow-inner">
                        <Folder className="w-5 h-5 text-amber-600 fill-amber-100" />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-xs text-amber-900 group-hover:text-amber-950 transition-colors uppercase tracking-wider">
                          包含圖片資源庫
                        </h4>
                        <p className="text-[10px] text-amber-705 font-medium font-mono text-amber-700">
                          存儲路徑: /public
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-850 border border-amber-500/30 font-mono">
                      {serverImages.length} 個文件
                    </span>
                  </div>

                  <p className="text-[11px] text-amber-800 leading-relaxed font-medium relative z-10">
                    這是在伺服器磁碟上保存商品目錄圖片的資料夾。拖拽圖片至此，或直接打開資料夾查看管理器！
                  </p>

                  {/* Drag Drop Inner Indicator Line */}
                  <div 
                    className="border border-dashed border-amber-300/60 rounded-xl p-3 bg-white/60 hover:bg-white/90 text-center cursor-pointer transition-all z-10 relative shadow-sm"
                    onClick={() => setIsFolderExplorerOpen(true)}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <FolderOpen className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-bold text-amber-900">打開資料夾管理器</span>
                    </div>
                    <p className="text-[9px] text-amber-600 mt-1">拖拽新相片至此卡片可直接上傳添加</p>
                  </div>
                </div>

              </div>

              {/* Right Column: Database list with search & editing */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 overflow-hidden animate-fadeIn">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h3 className="font-black text-slate-900 text-sm tracking-tight">在線商品資料記錄 (Live)</h3>
                    <p className="text-[11px] text-slate-400">檢索資料庫商品。可在此直接編輯屬性或替換關聯商品圖片。</p>
                  </div>
                  
                  {/* Local Quick Search input on dashboard list */}
                  <div className="relative max-w-xs w-full">
                    <input
                      type="text"
                      placeholder="搜尋資料庫記錄..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white text-slate-900 focus:border-indigo-400 text-xs rounded-xl pl-8 pr-3 py-2 outline-none transition-all font-semibold"
                    />
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Database Table layout */}
                <div className="overflow-x-auto border border-slate-100 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-650 min-w-[500px]">
                    <thead className="bg-slate-50/85 text-[10px] text-slate-400 uppercase font-extrabold tracking-wider border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-3">圖片</th>
                        <th className="px-4 py-3">商品名稱</th>
                        <th className="px-4 py-3 text-right">單價</th>
                        <th className="px-4 py-3 text-center">庫存狀態</th>
                        <th className="px-4 py-3 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {processedProducts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-slate-400 italic">
                            沒有與您的搜尋條件匹配的商品記錄。
                          </td>
                        </tr>
                      ) : (
                        processedProducts.slice(0, 50).map((prod) => (
                          <tr key={prod.id} className="hover:bg-slate-50/50 transition-all">
                            <td className="px-4 py-2 shrink-0">
                              <div className="w-10 h-10 rounded bg-slate-50 border border-slate-100 overflow-hidden relative">
                                <ProductImage
                                  id={prod.id}
                                  name={prod.name}
                                  fallbackUrl={prod.extraAttributes?.["Image URLs"]}
                                  isOutOfStock={!prod.hasStock}
                                  version={imageVersion}
                                />
                              </div>
                            </td>
                            <td className="px-4 py-2">
                              <div className="font-bold text-slate-800 line-clamp-1">{prod.name}</div>
                              <div className="text-[10px] text-slate-405 mt-0.5 line-clamp-1 text-slate-400">
                                {prod.extraAttributes?.["Categories"] || "無分類"}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-right font-black text-slate-900 font-mono">
                              {parseFloat(prod.price) > 0 ? `HK$${parseFloat(prod.price).toFixed(2)}` : "HK$0.00"}
                            </td>
                            <td className="px-4 py-2 text-center">
                              {prod.alwaysStock ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  長期充足
                                </span>
                              ) : prod.hasStock ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                  有現貨 ({prod.secondaryStockCount || "有現貨"})
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500">
                                  暫無現貨
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => {
                                  setSelectedProduct(prod);
                                  // Wait tiny tick, then edit
                                  setTimeout(() => {
                                    setEditProductName(prod.name);
                                    setEditProductPrice(prod.price);
                                    setEditProductQuantity(prod.alwaysStock ? "" : (prod.secondaryStockCount || ""));
                                    setEditProductRemarks(prod.extraAttributes?.["Merchant Remark"] || prod.extraAttributes?.["remarks"] || "");
                                    setEditProductImageFile(null);
                                    setEditProductImagePreview("");
                                    setIsEditingSelectedProduct(true);
                                  }, 30);
                                }}
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all font-bold text-[10px] inline-flex items-center gap-1.5 cursor-pointer"
                              >
                                <Edit className="w-3 h-3 text-indigo-500" />
                                <span>編輯</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {processedProducts.length > 50 && (
                  <p className="text-[10px] text-slate-400 text-center italic mt-2">
                    後台列表最多顯示前 50 條商品。使用搜尋功能可定位到具體 SKU 商品，或點擊「向客戶展示產品目錄」模式瀏覽。
                  </p>
                )}
              </div>

            </div>
          </main>
        </>
      ) : (
        <>
          {/* App Customer Catalog Header */}
          <header id="app-header" className="sticky top-0 bg-white/95 backdrop-blur-md border-b border-slate-100 z-30 transition-all shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
              
              {/* Logo & Connected Title */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-200">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h1 className="font-bold text-base text-slate-900 tracking-tight leading-none md:text-lg">
                      產品目錄
                    </h1>
                    {/* Compact Circle ABC Price Tier Selector */}
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-full border border-slate-200">
                      {(["A", "B", "C"] as const).map(tier => (
                        <button
                          key={tier}
                          onClick={() => setSelectedPriceTier(tier)}
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black transition-all duration-150 cursor-pointer ${
                            selectedPriceTier === tier
                              ? "bg-slate-950 text-white shadow-sm"
                              : "text-slate-500 hover:bg-slate-200 hover:text-slate-950"
                          }`}
                        >
                          {tier}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {isOffline || usingOfflineBackup ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1 animate-pulse"></span>
                        離線瀏覽模式
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>
                        表格實時連接
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 font-medium">
                      {products.length > 0 ? `共 ${products.length.toLocaleString()} 款商品` : "正在載入..."}
                    </span>
                  </div>
                </div>
              </div>

              {/* Navigation Actions */}
              <div className="flex items-center gap-2 md:gap-3">
                <div className="hidden lg:flex flex-col items-end text-right text-xs">
                  <span className="text-slate-400 font-medium flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> 已校對時間: {syncTime || "離線備份資料"}
                  </span>
                </div>

                {/* Sheets Synchronizer Button */}
                <button
                  onClick={() => loadProducts(true)}
                  disabled={syncing}
                  className={`p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all flex items-center gap-1.5 font-bold text-xs cursor-pointer ${
                    syncing ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  title="從 Google Sheet 同步最新數據"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${syncing ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">{syncing ? "同步中..." : "同步數據"}</span>
                </button>

                {/* Back to Management dashboard */}
                <button
                  onClick={() => setViewMode("admin")}
                  className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-900 transition-all flex items-center gap-1.5 font-bold text-xs cursor-pointer shrink-0"
                  title="後台管理 (⚙️)"
                >
                  <Settings className="w-4 h-4 text-indigo-600 animate-spin" style={{ animationDuration: '6s' }} />
                  <span>後台管理 ⚙️</span>
                </button>

                {/* Inquiry Trigger Drawer button */}
                <button
                  id="cart-trigger"
                  onClick={() => setIsCartOpen(true)}
                  className="relative p-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shadow-md shadow-slate-300 cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span className="hidden sm:inline font-bold text-xs tracking-wide">詢價清單</span>
                  {totalCartCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white font-black text-[10px] min-w-5 h-5 flex items-center justify-center rounded-full px-1 border-2 border-white shadow-sm ring-1 ring-rose-300">
                      {totalCartCount}
                    </span>
                  )}
                </button>
              </div>

            </div>
          </header>

          {/* Main Content Arena */}
          <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 lg:py-8">

        {/* Global Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 text-amber-950 border border-amber-200 flex items-start gap-3 shadow-sm">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">電子表格連接問題</p>
              <p className="text-xs text-amber-800 mt-1">{error}</p>
              <button 
                onClick={() => loadProducts()} 
                className="mt-3 inline-flex items-center px-3 py-1.5 bg-amber-900 text-white hover:bg-amber-800 leading-tight text-xs font-bold rounded-lg transition-all"
              >
                重試表格連接
              </button>
            </div>
          </div>
        )}

        {/* Search, Filter Tools and Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Left panel filters - Sidebar style for desktop */}
          <aside className="lg:col-span-1 space-y-6">
            
            {/* Search Input Widget */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                尋找商品
              </h3>
              <div className="relative">
                <input
                  type="text"
                  placeholder="商品編號、名稱、品牌、標籤..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white text-slate-900 rounded-xl pl-9.5 pr-4 py-2.5 text-xs transition-all outline-none font-semibold"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-all font-bold"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Parent Category List Filter - Dropdown Button Version */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3 relative">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  分類篩選
                </h3>
                {selectedParentCategory !== "All" && (
                  <button
                    onClick={() => {
                      handleParentCategoryChange("All");
                      setIsCategoryDropdownOpen(false);
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-900 font-bold transition-all"
                  >
                    清除篩選
                  </button>
                )}
              </div>

              {loading ? (
                <div id="cat-loading" className="h-10 bg-slate-50 animate-pulse rounded-xl"></div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/50 rounded-xl text-xs font-semibold text-slate-700 transition-all outline-none"
                  >
                    <span className="truncate">
                      {selectedParentCategory === "All" ? "全部商品" : selectedParentCategory}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isCategoryDropdownOpen ? "rotate-180" : ""}`} />
                  </button>

                  {isCategoryDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-150 rounded-xl shadow-lg z-50 max-h-[250px] overflow-y-auto py-1">
                      <button
                        type="button"
                        onClick={() => {
                          handleParentCategoryChange("All");
                          setIsCategoryDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 flex items-center justify-between ${selectedParentCategory === "All" ? "bg-slate-50 text-indigo-650 font-bold" : "text-slate-650"}`}
                      >
                        <span>全部商品</span>
                        <span className="text-[10px] text-slate-400 font-mono">({products.length})</span>
                      </button>

                      {topCategories.map(parentCat => {
                        const count = products.filter(p => {
                          const rawCat = p.extraAttributes["Categories"] || "";
                          return (rawCat.split("/")[0]?.trim() || "Other") === parentCat;
                        }).length;

                        return (
                          <button
                            key={parentCat}
                            type="button"
                            onClick={() => {
                              handleParentCategoryChange(parentCat);
                              setIsCategoryDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-xs font-medium hover:bg-slate-50 flex items-center justify-between ${selectedParentCategory === parentCat ? "bg-slate-50 text-indigo-650 font-bold" : "text-slate-650"}`}
                          >
                            <span className="truncate pr-2">{parentCat}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({count})</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Sub-Category Filter (Shows up dynamically when a main category is selected) */}
            {selectedParentCategory !== "All" && categoryStructure[selectedParentCategory] && categoryStructure[selectedParentCategory].length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                  子分類 ({selectedParentCategory})
                </h3>
                <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto pr-1">
                  <button
                    onClick={() => { setSelectedSubCategory("All"); setCurrentPage(1); }}
                    className={`text-left px-3 py-1.5 rounded-lg text-xs transition-all ${selectedSubCategory === "All" ? "bg-indigo-50 border border-indigo-100 text-indigo-900 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    全部子分組
                  </button>
                  {categoryStructure[selectedParentCategory].map(sub => {
                    const subCount = products.filter(p => {
                      const rawCat = p.extraAttributes["Categories"] || "";
                      const parent = rawCat.split("/")[0]?.trim() || "Other";
                      const currentSub = rawCat.split("/").slice(1).join(" / ")?.trim() || "General";
                      return parent === selectedParentCategory && currentSub === sub;
                    }).length;

                    return (
                      <button
                        key={sub}
                        onClick={() => { setSelectedSubCategory(sub); setCurrentPage(1); }}
                        className={`text-left px-3 py-1.5 rounded-lg text-xs transition-all flex items-center justify-between ${selectedSubCategory === sub ? "bg-indigo-50 border border-indigo-100 text-indigo-900 font-semibold" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        <span className="truncate pr-1">{sub}</span>
                        <span className="text-[10px] text-slate-400">({subCount})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inventory Status - Dropdown Version */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-3 relative">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-slate-400" />
                  <span>庫存狀態</span>
                </h3>
                {stockFilter !== "all" && (
                  <button
                    onClick={() => {
                      setStockFilter("all");
                      setCurrentPage(1);
                      setIsStockDropdownOpen(false);
                    }}
                    className="text-[11px] text-indigo-600 hover:text-indigo-900 font-bold transition-all"
                  >
                    重置
                  </button>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsStockDropdownOpen(!isStockDropdownOpen)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/50 rounded-xl text-xs font-semibold text-slate-700 transition-all outline-none"
                >
                  <span className="truncate">
                    {stockFilter === "all" && "顯示全部商品"}
                    {stockFilter === "in-stock" && "僅顯示有現貨"}
                    {stockFilter === "out-of-stock" && "無現貨 (不顯示/圖片置灰)"}
                    {stockFilter === "always-stock" && "長期充足 (無限量供應)"}
                    {stockFilter === "zero-stock" && "缺貨產品 (Col AB & AC = 0)"}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isStockDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {isStockDropdownOpen && (
                  <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-150 rounded-xl shadow-lg z-50 py-1">
                    {[
                      { value: "all", label: "顯示全部商品" },
                      { value: "in-stock", label: "僅顯示有現貨" },
                      { value: "out-of-stock", label: "無現貨 (不顯示/圖片置灰)" },
                      { value: "always-stock", label: "長期充足 (無限量供應)" },
                      { value: "zero-stock", label: "缺貨產品 (Col AB & AC = 0)" }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setStockFilter(opt.value);
                          setCurrentPage(1);
                          setIsStockDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-medium hover:bg-slate-50 flex items-center justify-between ${stockFilter === opt.value ? "bg-slate-50 text-indigo-600 font-bold" : "text-slate-600"}`}
                      >
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Offline Support & PDF Exporter Toolbox */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                <span>離線同步與 PDF 工具箱</span>
              </h3>

              <div className="space-y-3">
                {/* Image Pre-cacher */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-150 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-700">圖片快取同步器</span>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {cacheProgress >= 0 ? `${cacheCount.current}/${cacheCount.total}` : "已就緒"}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-normal">
                    一鍵下載目錄中所有商品圖片至手機/電腦。下載後，在飛機、港口等完全無訊號環境也能正常顯示商品相片！
                  </p>

                  {cacheProgress >= 0 ? (
                    <div className="space-y-1.5 pt-1">
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-emerald-500 h-full transition-all duration-150" 
                          style={{ width: `${cacheProgress}%` }}
                        ></div>
                      </div>
                      <div className="text-[9px] text-emerald-600 font-bold flex items-center justify-between animate-pulse">
                        <span>正在為您的手機下載圖片...</span>
                        <span>{cacheProgress}%</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handlePrecacheAllImages}
                      className="w-full py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-600" />
                      立即下載全目錄圖片
                    </button>
                  )}
                </div>

                {/* PDF Generation */}
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-150 space-y-2">
                  <span className="text-[11px] font-bold text-slate-700 block">PDF 目錄產生器</span>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    匯出帶有商品分類書籤的 A4 PDF 文件。便於列印、分發給客戶或直接在手機儲存閱讀。
                  </p>

                  <div className="grid grid-cols-1 gap-1.5 pt-1">
                    <button
                      onClick={() => setIsPreviewingPdfPrint(true)}
                      className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      🖨️ 列印 / 儲存 PDF 目錄
                    </button>
                    
                    <button
                      onClick={handleGenerateJsPdf}
                      disabled={isGeneratingPdf}
                      className="w-full py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isGeneratingPdf ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                      <span>{isGeneratingPdf ? "正在產生 PDF..." : "下載帶書籤 PDF"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </aside>

          {/* Right Area: Interactive Catalog Sorter + Card Grid */}
          <div className="lg:col-span-3 space-y-6">

            {/* Status Panel: results count & sorters bar */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              
              <div className="text-xs text-slate-500 font-medium">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    正在分析商品目錄...
                  </span>
                ) : (
                  <span>
                    找到 <strong className="text-slate-900">{processedProducts.length.toLocaleString()}</strong> 個結果 
                    {selectedParentCategory !== "All" && <span> 屬於分類 <strong className="text-indigo-600">{selectedParentCategory}</strong></span>}
                    {searchQuery && <span> 匹配 &ldquo;<strong className="text-rose-600">{searchQuery}</strong>&rdquo;</span>}
                  </span>
                )}
              </div>

              {/* Sorting and Page Size selectors */}
              <div className="flex flex-wrap items-center gap-3">
                
                {/* Sorter Dropdown */}
                <div className="flex items-center gap-2">
                  <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  <select
                    value={sortKey}
                    onChange={(e) => setSortKey(e.target.value)}
                    className="bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-slate-400"
                  >
                    <option value="name-asc">按名稱排序 (A-Z)</option>
                    <option value="price-asc">單價 (由低至高)</option>
                    <option value="price-desc">單價 (由高至低)</option>
                    <option value="id-asc">商品 ID (編號大小)</option>
                  </select>
                </div>

              </div>

            </div>

            {/* Dynamic Card Grid containing results */}
            {loading ? (
              <div id="grid-loading" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-4 shadow-sm animate-pulse h-80">
                    <div className="bg-slate-100 rounded-xl aspect-square w-full"></div>
                    <div className="h-4 bg-slate-100 rounded w-2/3"></div>
                    <div className="h-4 bg-slate-100 rounded w-1/3"></div>
                  </div>
                ))}
              </div>
            ) : processedProducts.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center max-w-xl mx-auto shadow-sm space-y-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-400 border border-slate-100 select-none">
                  <Search className="w-8 h-8" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">未找到匹配的商品</h3>
                <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                  沒有找到符合當前條件的產品。您可以嘗試減少搜尋關鍵字、切換不同的類別、或者選擇顯示「無現貨」的產品。
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedParentCategory("All");
                    setSelectedSubCategory("All");
                    setStockFilter("all");
                  }}
                  className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl transition-all"
                >
                  重置篩選條件
                </button>
              </div>
            ) : (
              <div>
                <div id="product-grid" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-3 gap-6">
                  {paginatedProducts.map(product => (
                    <article
                      key={product.id}
                      className={`group bg-white rounded-2xl border hover:border-slate-300 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.01)] hover:shadow-md flex flex-col overflow-hidden relative ${!product.hasStock ? "opacity-80" : ""}`}
                    >
                      {/* Interactive click triggers modal */}
                      <div 
                        onClick={() => setSelectedProduct(product)}
                        className="cursor-pointer relative aspect-square bg-slate-50 overflow-hidden shrink-0"
                      >
                        <ProductImage
                          id={product.id}
                          name={product.name}
                          fallbackUrl={product.extraAttributes["Image URLs"]}
                          isOutOfStock={!product.hasStock}
                          version={imageVersion}
                        />

                        {/* Inventory stock badges */}
                        <div className="absolute top-3 left-3 flex flex-col gap-1 z-10">
                          {product.alwaysStock ? (
                            <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500 text-white shadow-sm tracking-wide">
                              長期充足
                            </span>
                          ) : product.hasStock ? (
                            <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-500 text-white shadow-sm tracking-wide">
                              有現貨 ({product.secondaryStockCount || "有現貨"})
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-600/90 backdrop-blur-xs text-white shadow-sm tracking-wide">
                              暫無現貨
                            </span>
                          )}
                        </div>

                        {/* Hover Overlay info guide */}
                        <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                          <span className="px-3 py-1.5 rounded-xl bg-white text-slate-900 font-bold text-xs shadow-md">
                            查看商品詳情
                          </span>
                        </div>
                      </div>

                      {/* Info & pricing area */}
                      <div className="p-4 flex-grow flex flex-col justify-between space-y-3">
                        <div className="space-y-1">
                          <span className="text-[10px] font-mono text-slate-400 tracking-wider block font-semibold uppercase">
                            編號: {product.id}
                          </span>
                          <h4 
                            onClick={() => setSelectedProduct(product)}
                            className="font-bold text-slate-800 text-xs md:text-sm line-clamp-2 hover:text-indigo-600 cursor-pointer transition-colors leading-snug"
                            title={product.name}
                          >
                            {product.name}
                          </h4>
                          {product.extraAttributes["Categories"] && (
                            <span className="inline-block text-[11px] font-medium text-indigo-600 bg-indigo-50/50 border border-indigo-100/50 rounded-md px-1.5 py-0.5">
                              {product.extraAttributes["Categories"].trim()}
                            </span>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-50 flex items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">售價</span>
                            <span className="font-extrabold text-slate-900 text-sm md:text-base">
                              {parseFloat(getProductPrice(product)) > 0 ? (
                                <span className="flex items-center gap-1.5">
                                  <span>HK${parseFloat(getProductPrice(product)).toFixed(2)}</span>
                                  {selectedPriceTier && (
                                    <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-1 py-0.2">
                                      {selectedPriceTier}
                                    </span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-[11px] font-black text-rose-500 bg-rose-50 px-1 py-0.5 rounded">價格由詢價決定</span>
                              )}
                            </span>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(product, 1);
                            }}
                            className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all font-bold"
                            title="添加到詢價單"
                          >
                            <ShoppingCart className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {/* Elegant Product Count Footer */}
                <footer className="mt-10 bg-white border border-slate-100 rounded-2xl p-4 shadow-sm text-center">
                  <div className="text-xs text-slate-500 font-bold">
                    已載入全部商品（共 {processedProducts.length.toLocaleString()} 款商品）
                  </div>
                </footer>

              </div>
            )}

          </div>

        </div>

      </main>
      </>
      )}

      {/* Interactive Item Details Portal Modal */}
      {selectedProduct && (
        <div 
          id="product-modal"
          onClick={() => {
            setIsEditingSelectedProduct(false);
            setSelectedProduct(null);
          }}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 transition-all animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative border border-slate-100 animate-slideUp flex flex-col md:flex-row"
          >
            {isEditingSelectedProduct ? (
              <form onSubmit={handleUpdateProductSubmit} className="w-full flex flex-col md:flex-row">
                {/* Modal Exit cross */}
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingSelectedProduct(false);
                    setSelectedProduct(null);
                  }}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/85 hover:bg-slate-100 text-slate-800 transition-all z-20 shadow-md border border-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Left Col: Photo Display within modal */}
                <div className="md:w-1/2 aspect-square bg-slate-50 p-6 relative border-r border-slate-100 shrink-0 flex flex-col items-center justify-center">
                  <div className="w-full aspect-square rounded-2xl border-2 border-slate-100 bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 relative">
                    {editProductImagePreview ? (
                      <img 
                        src={editProductImagePreview} 
                        alt="Preview" 
                        className="w-full h-full object-cover animate-fadeIn"
                      />
                    ) : (
                      <ProductImage
                        id={selectedProduct.id}
                        name={selectedProduct.name}
                        fallbackUrl={selectedProduct.extraAttributes?.["Image URLs"]}
                        isOutOfStock={!selectedProduct.hasStock}
                        version={imageVersion}
                      />
                    )}
                  </div>

                  <div className="mt-4 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => document.getElementById("edit-product-file-input")?.click()}
                      className="py-1.5 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-all text-xs font-bold flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5 text-indigo-600" />
                      更換圖片
                    </button>
                    <input 
                      id="edit-product-file-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleEditProductImageChange}
                    />
                    <p className="text-[10px] text-slate-400 text-center font-mono uppercase tracking-wider">
                      將覆蓋 {selectedProduct.id}.jpg
                    </p>
                  </div>
                </div>

                {/* Right Col: Complex attributes listing */}
                <div className="p-6 md:p-8 flex flex-col justify-between flex-grow">
                  <div className="space-y-4">
                                        {/* Pricing Input */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        單價 (HK$)
                      </label>
                      <input 
                        type="text"
                        placeholder="例如：61"
                        value={editProductPrice}
                        onChange={(e) => setEditProductPrice(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs transition-all outline-none font-mono"
                      />
                    </div>

                    {/* Quantity Input */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        庫存狀態 / 數量
                      </label>
                      <input 
                        type="text"
                        placeholder="例如：39（留空代表長期充足 / 無限量供應）"
                        value={editProductQuantity}
                        onChange={(e) => setEditProductQuantity(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs transition-all outline-none"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block font-medium leading-normal">
                        提示：輸入「0」可使圖片置灰（無現貨），或輸入正整數。
                      </span>
                    </div>

                    {/* Remarks Input */}
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        備註 / 商家備註
                      </label>
                      <textarea 
                        placeholder="描述具體細節、特殊規格、優惠或代碼"
                        value={editProductRemarks}
                        onChange={(e) => setEditProductRemarks(e.target.value)}
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs transition-all outline-none resize-none"
                      />
                    </div>

                  </div>

                  {/* Save / Cancel actions */}
                  <div className="mt-8 pt-4 border-t border-slate-150 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsEditingSelectedProduct(false)}
                      className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold transition-all text-xs"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={isUpdatingProduct}
                      className="py-2.5 px-5 rounded-xl bg-indigo-600 border border-indigo-600 text-white font-extrabold hover:bg-indigo-700 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs"
                    >
                      {isUpdatingProduct ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin text-white" />
                          儲存中...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          儲存修改
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <>
                {/* Modal Exit cross */}
                <button
                  onClick={() => {
                    setIsEditingSelectedProduct(false);
                    setSelectedProduct(null);
                  }}
                  className="absolute top-4 right-4 p-2 rounded-full bg-white/85 hover:bg-slate-100 text-slate-800 transition-all z-20 shadow-md border border-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>

                {/* Left Col: Photo Display within modal */}
                <div className="md:w-1/2 aspect-square bg-slate-50 relative border-r border-slate-100 shrink-0">
                  <ProductImage
                    id={selectedProduct.id}
                    name={selectedProduct.name}
                    fallbackUrl={selectedProduct.extraAttributes["Image URLs"]}
                    isOutOfStock={!selectedProduct.hasStock}
                    version={imageVersion}
                  />
                  <div className="absolute bottom-4 left-4 flex gap-1.5 z-10">
                    {selectedProduct.alwaysStock ? (
                      <span className="px-2.5 py-1 bg-emerald-550 shadow bg-emerald-600 text-white rounded-lg text-xs font-bold">
                        長期充足 (Col AB = 1)
                      </span>
                    ) : selectedProduct.hasStock ? (
                      <span className="px-2.5 py-1 bg-amber-550 shadow bg-amber-600 text-white rounded-lg text-xs font-bold">
                        庫存量：{selectedProduct.secondaryStockCount || "有現貨"}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-slate-600 shadow text-white rounded-lg text-xs font-bold uppercase tracking-wider">
                        暫無現貨 - 圖片置灰
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Col: Complex attributes listing */}
                <div className="p-6 md:p-8 flex flex-col justify-between flex-grow">
                  
                  <div className="space-y-4">
                    
                    {/* ID & category tags */}
                    <div className="space-y-1">
                      <span className="text-xs font-mono text-slate-400 font-bold block uppercase tracking-wider">
                        商品規格：{selectedProduct.id}
                      </span>
                      <h2 className="text-slate-900 font-black text-lg md:text-xl leading-snug">
                        {selectedProduct.name}
                      </h2>
                      {selectedProduct.extraAttributes["Categories"] && (
                        <div className="inline-flex mt-1.5 flex-wrap gap-2">
                          {selectedProduct.extraAttributes["Categories"].split("/").map((tc, key) => (
                            <span key={key} className="text-xs px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold rounded-md">
                              {tc.trim()}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Live pricing presentation */}
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">售價</span>
                        <span className="text-2xl font-black text-slate-900">
                          {parseFloat(getProductPrice(selectedProduct)) > 0 ? (
                            <span className="flex items-center gap-2">
                              <span>HK${parseFloat(getProductPrice(selectedProduct)).toFixed(2)}</span>
                              {selectedPriceTier && (
                                <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-150 rounded-lg px-2 py-0.5">
                                  價格 {selectedPriceTier}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-sm font-bold text-rose-600 py-1 inline-block">歡迎查詢價格 (HK$ 0.00 / 歡迎查詢)</span>
                          )}
                        </span>
                      </div>
                      {parseFloat(selectedProduct.price) > 0 && selectedProduct.extraAttributes["Discounted Price"] && (
                        <div className="text-right text-xs">
                          <span className="text-slate-400 line-through">HK${parseFloat(selectedProduct.extraAttributes["Discounted Price"]).toFixed(2)}</span>
                          <span className="block text-emerald-600 font-bold">特別推廣優惠</span>
                        </div>
                      )}
                    </div>

                    {/* Extra parameters Grid */}
                    <div className="space-y-2">
                      <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider block">試算表欄位屬性資訊：</span>
                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/50 p-3 rounded-2xl border border-slate-100 leading-normal">
                        <div>
                          <span className="text-slate-400 block font-medium">SKU 編號：</span>
                          <span className="text-slate-700 font-semibold">{selectedProduct.extraAttributes["SKU"] || "無"}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-medium">發布狀態：</span>
                          <span className="text-slate-700 font-semibold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            {selectedProduct.extraAttributes["Publish Status"] || "已發布"}
                          </span>
                        </div>
                        {selectedProduct.extraAttributes["Weight (kg)"] && (
                          <div>
                            <span className="text-slate-400 block font-medium">商品重量：</span>
                            <span className="text-slate-700 font-semibold">{selectedProduct.extraAttributes["Weight (kg)"]} kg</span>
                          </div>
                        )}
                        {selectedProduct.extraAttributes["Hashtags"] && (
                          <div className="col-span-2">
                            <span className="text-slate-400 block font-medium">標籤關鍵字：</span>
                            <span className="text-indigo-600 font-medium">{selectedProduct.extraAttributes["Hashtags"]}</span>
                          </div>
                        )}
                        {selectedProduct.extraAttributes["Merchant Remark"] && (
                          <div className="col-span-2 pt-1.5 border-t border-slate-100/60">
                            <span className="text-slate-400 block font-medium">商品說明 / 備註：</span>
                            <p className="text-slate-650 text-[11px] leading-relaxed italic">{selectedProduct.extraAttributes["Merchant Remark"]}</p>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Action Area footer */}
                  <div className="mt-8 pt-4 border-t border-slate-150 flex items-center gap-3">
                    <button
                      id="modal-add-to-cart"
                      onClick={() => {
                        addToCart(selectedProduct, 1);
                        setSelectedProduct(null);
                      }}
                      className="flex-grow py-3 px-4 rounded-xl bg-slate-900 border border-slate-900 text-white font-extrabold hover:bg-slate-800 tracking-wide transition-all shadow-md shadow-slate-200 flex items-center justify-center gap-2 text-xs uppercase animate-fadeIn"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      加入詢價單
                    </button>
                    {viewMode === "admin" && (
                      <button
                        onClick={handleStartEditing}
                        className="py-3 px-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-705 hover:bg-indigo-100 font-bold transition-all text-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Edit className="w-4 h-4 text-indigo-600" />
                        編輯
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setIsEditingSelectedProduct(false);
                        setSelectedProduct(null);
                      }}
                      className="py-3 px-4 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 font-bold transition-all text-xs"
                    >
                      關閉
                    </button>
                  </div>

                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* Slide-out Cart/Quote Calculation Drawer menu panel */}
      {isCartOpen && (
        <div 
          onClick={() => setIsCartOpen(false)}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-3xs z-50 flex justify-end"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-white h-screen flex flex-col justify-between shadow-2xl relative border-l border-slate-100 animate-slideLeft"
          >
            
            {/* Drawer topmost header section */}
            <header className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-slate-800" />
                <h3 className="font-bold text-slate-900 text-base">Inquiry Quote Sheet</h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1.5 rounded-lg border border-slate-150 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* List of items scrolling viewport */}
            <div className="p-5 flex-grow overflow-y-auto space-y-4">
              
              {cart.length === 0 ? (
                <div className="text-center py-12 px-4 space-y-3">
                  <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300 border border-slate-100">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-slate-800 text-xs">您的詢價單目前為空</h4>
                  <p className="text-[11px] text-slate-400 max-w-[240px] mx-auto">
                    請從目錄列表中挑選商品加入詢價單，以便您整理和預算產品需求。
                  </p>
                  <button
                    onClick={() => setIsCartOpen(false)}
                    className="mt-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-1.5 transition-all"
                  >
                    瀏覽商品目錄
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  
                  {cart.map(item => {
                    const price = parseFloat(getProductPrice(item.product)) || 0;
                    const subtotal = price * item.quantity;
                    
                    return (
                      <article 
                        key={item.product.id}
                        className="p-3 bg-slate-50 rounded-2xl border border-slate-150/60 relative flex items-start gap-3"
                      >
                        {/* mini product thumbnail */}
                        <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 relative aspect-square">
                          <ProductImage
                            id={item.product.id}
                            name={item.product.name}
                            fallbackUrl={item.product.extraAttributes["Image URLs"]}
                            isOutOfStock={!item.product.hasStock}
                            version={imageVersion}
                          />
                        </div>

                        {/* Title, Id & dynamic actions */}
                        <div className="flex-grow space-y-2">
                          <div className="space-y-0.5 pr-6">
                            <span className="text-[9px] font-mono font-bold text-slate-400 block tracking-wider uppercase">
                              編號: {item.product.id}
                            </span>
                            <h5 className="font-bold text-slate-800 text-xs line-clamp-1 leading-tight">
                              {item.product.name}
                            </h5>
                            <span className="text-[10px] font-extrabold text-slate-900 block">
                              {price > 0 ? `HK$${price.toFixed(2)}` : "歡迎查詢價格"}
                            </span>
                          </div>

                          {/* Quantities stepper adjusters */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center border border-slate-200 bg-white rounded-lg p-0.5 shadow-xs">
                              <button
                                onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                                className="p-1 rounded hover:bg-slate-50 text-slate-500"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="w-7 text-center text-xs font-bold text-slate-850">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                                className="p-1 rounded hover:bg-slate-50 text-slate-500"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            {/* subtotal display */}
                            <span className="text-[11px] font-extrabold text-indigo-700">
                              {price > 0 ? `小計金額: HK$${subtotal.toFixed(2)}` : "—"}
                            </span>
                          </div>
                        </div>

                        {/* Quick dismiss delete button */}
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="absolute top-2 right-2 text-slate-400 hover:text-rose-500 p-1 rounded-lg transition-colors border border-transparent hover:bg-white"
                          title="移除此項"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                      </article>
                    );
                  })}

                  {/* Clean clear shopping cart button */}
                  <div className="text-right">
                    <button
                      onClick={clearCart}
                      className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:underline transition-all"
                    >
                      清空詢價清單
                    </button>
                  </div>

                </div>
              )}

            </div>

            {/* Sticky Pricing & Inquiry Compiling Panel footer */}
            {cart.length > 0 && (
              <footer className="p-5 border-t border-slate-100 bg-slate-50/50 space-y-4">
                
                {/* Total indicators */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-slate-500">
                    <span>商品總件數:</span>
                    <span className="font-bold">{totalCartCount}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-900 border-t border-slate-100 pt-2 text-sm">
                    <span className="font-bold text-slate-700">預計總估算價:</span>
                    <span className="font-extrabold text-lg text-slate-950">HK${totalCartPrice.toFixed(2)}</span>
                  </div>
                </div>

                {/* Text summary compiled accordion preview */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">系統詢價內容預覽:</span>
                  <div className="bg-white border border-slate-205 border-slate-200 p-2.5 rounded-xl font-mono text-[9px] text-slate-500 h-24 overflow-y-auto leading-normal select-all">
                    {compileQuoteText}
                  </div>
                </div>

                {/* Primary dispatch calls */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={copyToClipboard}
                    className="py-3 px-3 rounded-xl border border-slate-250 bg-white border-slate-200 text-slate-800 hover:bg-slate-50 font-bold transition-all flex items-center justify-center gap-1.5 text-[11px]"
                  >
                    {copiedQuote ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    {copiedQuote ? "已複製內容!" : "複製詢價單"}
                  </button>

                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(compileQuoteText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="py-3 px-3 rounded-xl bg-green-600 hover:bg-green-700 hover:scale-[1.01] text-white font-extrabold transition-all flex items-center justify-center gap-1.5 text-[11px] text-center shadow-md shadow-green-150"
                  >
                    <ExternalLink className="w-4 h-4" />
                    分享至 WhatsApp
                  </a>
                </div>

                <div className="py-2.5 relative border border-dashed border-slate-250 border-slate-200 rounded-xl bg-white/70 p-3">
                  <p className="text-[10px] text-slate-400 text-center leading-relaxed font-semibold">
                    💡 提示：您可以一鍵「複製詢價單」或點擊「分享至 WhatsApp」直接傳送給商家，以便獲得最新的正式報價。
                  </p>
                </div>

              </footer>
            )}

          </div>
        </div>
      )}

      {/* Photo Upload Manager Modal */}
      {isUploadOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 transition-all animate-fadeIn"
          onClick={() => setIsUploadOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl relative border border-slate-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-slate-950 font-black text-sm md:text-base flex items-center gap-2">
                  <Upload className="w-5 h-5 text-indigo-600" />
                  本地相片上傳管理器
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 text-[11px] md:text-xs">
                  安全上傳並連結儲存在您電腦中的產品目錄 JPEG/PNG 相片
                </p>
              </div>
              <button 
                onClick={() => setIsUploadOpen(false)}
                className="p-1.5 rounded-lg border border-slate-150 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content: scrollable */}
            <div className="p-6 overflow-y-auto space-y-6 flex-grow">
              
              {/* Drag/Drop Zone */}
              <div 
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${isDragOver ? "border-indigo-600 bg-indigo-50/40" : "border-slate-200 hover:border-slate-300 bg-slate-50/50"}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById("file-upload-input")?.click()}
              >
                <input 
                  id="file-upload-input"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
                
                <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto text-indigo-600 mb-3 border border-indigo-100">
                  <Upload className="w-6 h-6 animate-pulse" />
                </div>
                
                <h4 className="font-bold text-xs text-slate-800">將圖片文件拖拽到此處，或 <span className="text-indigo-600 underline">點擊瀏覽</span></h4>
                <p className="text-[10px] text-slate-400 mt-1 max-w-sm mx-auto">
                  提示：若將相片命名為商品 ID（例如：<strong>4594204368830464.jpg</strong>），系統將會自動連結對應商品！
                </p>
              </div>

              {/* Queue Listing */}
              {uploadFiles.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>上傳隊列 ({uploadFiles.length} 個文件)</span>
                    <button 
                      onClick={clearQueue}
                      className="text-rose-600 hover:text-rose-800 hover:underline"
                    >
                      清空確認隊列
                    </button>
                  </div>

                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {uploadFiles.map((item) => {
                      const matchedProd = products.find(p => {
                        const productNormalized = p.id.toLowerCase().replace(/^(id[-_])?/i, "").trim();
                        const itemNormalized = item.mappedProductId.toLowerCase().replace(/^(id[-_])?/i, "").trim();
                        return productNormalized === itemNormalized || p.id.toLowerCase() === item.mappedProductId.toLowerCase();
                      });
                      return (
                        <div 
                          key={item.id} 
                          className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between gap-4 text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-grow">
                            <span className="p-2 rounded-lg bg-white border border-slate-100 text-slate-400 font-mono text-[9px] shrink-0">
                              {item.file.name.split(".").pop()?.toUpperCase() || "IMG"}
                            </span>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 truncate" title={item.file.name}>
                                {item.file.name}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {(item.file.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                          </div>

                          {/* Matching action / state input */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              {item.mappedProductId ? (
                                <span className="inline-block px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100 font-bold text-[10px]">
                                  已連結 # {matchedProd ? matchedProd.id : item.mappedProductId}
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-100 font-bold text-[10px]">
                                  未連結
                                </span>
                              )}
                              
                              {matchedProd && (
                                <p className="text-[9px] text-slate-400 truncate max-w-[120px]" title={matchedProd.name}>
                                  {matchedProd.name}
                                </p>
                              )}
                            </div>

                            {/* TextInput to manually map if not matched */}
                            {!item.mappedProductId && (
                              <input
                                type="text"
                                placeholder="輸入商品 ID..."
                                value={item.mappedProductId || ""}
                                onChange={(e) => {
                                  const val = e.target.value.trim();
                                  // Live match check to auto-fill clean database ID
                                  const perfect = products.find(p => 
                                    p.id.toLowerCase() === val.toLowerCase() ||
                                    p.id.toLowerCase().replace(/^(id[-_])?/i, "") === val.toLowerCase().replace(/^(id[-_])?/i, "")
                                  );
                                  setUploadFiles(prev => prev.map(u => u.id === item.id ? { 
                                    ...u, 
                                    mappedProductId: perfect ? perfect.id : val 
                                  } : u));
                                }}
                                className="bg-white border border-slate-200 text-[10px] font-semibold text-slate-700 rounded-lg p-1.5 outline-none w-[115px] focus:border-indigo-500 transition-all text-center"
                              />
                            )}

                            {/* Status and close */}
                            <div className="w-16 text-center">
                              {item.status === "pending" && (
                                <span className="text-[10px] text-slate-500 font-medium">準備就緒</span>
                              )}
                              {item.status === "uploading" && (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600 mx-auto" />
                              )}
                              {item.status === "success" && (
                                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1 justify-center">
                                  <Check className="w-3.5 h-3.5" /> 完成
                                </span>
                              )}
                              {item.status === "error" && (
                                <span className="text-[10px] text-rose-600 font-semibold truncate block" title={item.error || "Failed"}>
                                  錯誤
                                </span>
                              )}
                            </div>

                            <button 
                              onClick={() => removeQueueItem(item.id)}
                              className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Info guidelines */}
              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-2">
                <h5 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-slate-400" />
                  伺服器本地相片連結原理
                </h5>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  當您使用此工具上傳相片時，相片會被安全地寫入伺服器的靜態目錄下。商品目錄會按照以下優先順序搜尋本地相片，並自動關聯：
                </p>
                <div className="grid grid-cols-2 gap-2 font-mono text-[9px] text-indigo-600 bg-white p-2.5 rounded-xl border border-slate-200">
                  <div>1. /&ldquo;ProductId&rdquo;.jpg</div>
                  <div>2. /&ldquo;ProductId&rdquo;.jpeg</div>
                  <div>3. /products/&ldquo;ProductId&rdquo;.jpg</div>
                  <div>4. /images/&ldquo;ProductId&rdquo;.jpg</div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => setIsUploadOpen(false)}
                className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium transition-all text-xs"
              >
                取消並關閉
              </button>
              
              <button
                disabled={uploadFiles.filter(item => item.status === "pending" || item.status === "error").length === 0}
                onClick={startUpload}
                className="py-2.5 px-5 rounded-xl bg-slate-900 border border-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs"
              >
                <Upload className="w-4 h-4" />
                Upload Selected Files
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Product Files Folder Explorer Modal */}
      {isFolderExplorerOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 transition-all animate-fadeIn"
          onClick={() => setIsFolderExplorerOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl relative border border-slate-105 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with Server Folder Styling */}
            <div className="p-6 border-b border-slate-100 bg-amber-50/20 flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center shadow-inner">
                  <FolderOpen className="w-6 h-6 text-amber-500 fill-amber-100" />
                </div>
                <div>
                  <h3 className="text-slate-950 font-black text-xs md:text-sm flex items-center gap-2">
                    伺服器儲存資料夾瀏覽檢視
                    <span className="text-[9px] bg-slate-900 text-white px-2 py-0.5 rounded-full font-mono uppercase">
                      磁碟 /public
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5 text-[10px] md:text-xs">
                    提供伺服器本地資料夾的文件系統檢視。直接拖拽放開新相片即可寫入此路徑。
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <div className="hidden md:block text-right">
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">已用磁碟容量</p>
                  <p className="text-xs text-slate-700 font-black font-mono">{(totalStorageSize / 1024).toFixed(1)} KB ({serverImages.length} 個檔案)</p>
                </div>
                <button 
                  onClick={() => setIsFolderExplorerOpen(false)}
                  className="p-1.5 rounded-lg border border-slate-150 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all font-bold"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main content: Grid Split */}
            <div className="p-6 overflow-y-auto space-y-6 flex-grow flex flex-col md:flex-row gap-6">
              
              {/* Left Side inside Modal: Drag / Drop Target Area */}
              <div className="md:w-1/3 flex flex-col gap-4 shrink-0">
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-4">
                  <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Upload className="w-4 h-4 text-indigo-600" />
                    在此處寫入文件
                  </h4>
                  
                  <div 
                    className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center transition-all cursor-pointer bg-white hover:border-indigo-500 hover:bg-indigo-50/10"
                    onDragOver={(e) => { e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                        addFilesToQueue(Array.from(e.dataTransfer.files));
                        setIsUploadOpen(true);
                      }
                    }}
                    onClick={() => {
                      document.getElementById("folder-upload-input-file")?.click();
                    }}
                  >
                    <input 
                      id="folder-upload-input-file"
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) {
                          addFilesToQueue(Array.from(e.target.files));
                          setIsUploadOpen(true);
                        }
                      }}
                    />
                    <Folder className="w-8 h-8 text-amber-500 mx-auto mb-2 animate-bounce fill-amber-100" />
                    <p className="font-bold text-slate-705 text-[11px] leading-tight mt-1 text-slate-700">
                      拖拽相片放開至此
                    </p>
                    <p className="text-[9px] text-slate-400 mt-0.5">
                      或點擊此處瀏覽電腦資料夾
                    </p>
                  </div>

                  <div className="space-y-2 text-[11px] text-slate-500 leading-relaxed bg-white p-3 rounded-xl border border-slate-200/50">
                    <p className="font-bold text-slate-800 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-indigo-500" />
                      快捷操作指南:
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-[10px] text-slate-500">
                      <li>將相片命名為商品 ID (如 <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-700 font-bold">1005.jpg</code>) 即可自動與產品建立連結。</li>
                      <li>配對成功的相片將會立刻取代預設圖，並顯示在商品目錄中。</li>
                      <li>推薦上傳常見的網頁相片格式：JPG/JPEG, PNG, WEBP, GIF。</li>
                    </ul>
                  </div>
                </div>

                <div className="text-center">
                  <button
                    onClick={() => {
                      setIsUploadOpen(true);
                    }}
                    className="w-full py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-935 transition-all font-bold text-xs flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-4 h-4 text-indigo-600" />
                    手動上傳隊列 ({uploadFiles.length})
                  </button>
                </div>
              </div>

              {/* Right Side inside Modal: File Listing, Search, Filter */}
              <div className="flex-grow flex flex-col gap-4 min-w-0">
                {/* Search Bar for Folder contents */}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="搜尋目錄中的相片檔案名稱、格式或產品 ID..."
                    value={folderSearchQuery}
                    onChange={(e) => setFolderSearchQuery(e.target.value)}
                    className="w-full bg-slate-550 bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white text-slate-955 rounded-xl pl-9 pr-4 py-2.5 text-xs transition-all outline-none"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  {folderSearchQuery && (
                    <button 
                      onClick={() => setFolderSearchQuery("")}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 transition-all font-bold"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {loadingServerImages ? (
                  <div className="flex-grow flex flex-col items-center justify-center py-12 gap-2">
                    <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
                    <p className="text-xs text-slate-400 font-medium font-mono">正在分析讀取目錄檔案...</p>
                  </div>
                ) : (() => {
                  const filteredImages = serverImages.filter((img) => {
                    const query = folderSearchQuery.toLowerCase().trim();
                    if (!query) return true;
                    
                    const filenameLower = img.filename.toLowerCase();
                    const basename = img.filename.split(".")[0] || "";
                    
                    if (filenameLower.includes(query)) return true;
                    
                    const mathProd = products.find(p => p.id.toLowerCase() === basename.toLowerCase());
                    if (mathProd && mathProd.name.toLowerCase().includes(query)) return true;
                    
                    return false;
                  });

                  if (filteredImages.length === 0) {
                    return (
                      <div className="flex-grow flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-3xl p-10 bg-slate-50/50">
                        <Folder className="w-12 h-12 text-slate-300 stroke-1 mb-2" />
                        <p className="font-bold text-slate-700 text-xs text-center">無匹配檔案</p>
                        <p className="text-[10px] text-slate-400 mt-1 text-center font-medium">
                          {serverImages.length === 0 ? "儲存目錄目前為空，請拖放圖片上傳檔案！" : "請嘗試調整搜尋關鍵字"}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="flex-grow overflow-y-auto max-h-[50vh] pr-1">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                        {filteredImages.map((img) => {
                          const lastDotVal = img.filename.lastIndexOf(".");
                          const baseName = lastDotVal !== -1 ? img.filename.substring(0, lastDotVal) : img.filename;
                          const ext = img.filename.split(".").pop()?.toUpperCase() || "JPG";
                          
                          // Smart base needle extraction (remove trailing suffixes like -1 or _1)
                          let baseProductNeedle = baseName;
                          const suffixRegex = /[-_]\d+$/;
                          if (suffixRegex.test(baseName)) {
                            baseProductNeedle = baseName.replace(suffixRegex, "");
                          }
                          const matchedProduct = products.find(
                            p => p.id.toLowerCase() === baseProductNeedle.toLowerCase() || p.id.toLowerCase() === baseName.toLowerCase()
                          );

                          return (
                            <div 
                              key={img.filename}
                              className="group relative bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-xs hover:shadow-md hover:border-slate-300 transition-all flex flex-col h-[200px]"
                            >
                              <div className="h-[95px] bg-slate-50 relative overflow-hidden flex-shrink-0 flex items-center justify-center border-b border-slate-100">
                                <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:10px_10px] opacity-20 pointer-events-none"></div>
                                <img 
                                  src={`/${img.filename}?v=${imageVersion}`}
                                  alt={img.filename}
                                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                                {img.size === 0 && (
                                  <div className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center p-2 text-center pointer-events-none">
                                    <span className="text-[9px] bg-amber-550 bg-amber-500 text-slate-950 font-black px-1.5 py-0.5 rounded shadow uppercase tracking-wide">
                                      空檔案
                                    </span>
                                    <span className="text-[8px] text-slate-500 font-bold mt-1 leading-tight">
                                      0 字節 (無圖片內容)
                                    </span>
                                  </div>
                                )}
                                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-slate-900/85 backdrop-blur-xs text-white text-[8px] font-black tracking-widest uppercase font-mono">
                                  {ext}
                                </span>
                                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1.5 z-10">
                                  <button
                                    onClick={() => deleteServerImage(img.filename)}
                                    className="p-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold transition-all shadow-md"
                                    title="永久刪除相片"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <a
                                    href={`/${img.filename}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="p-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-800 font-bold transition-all shadow-md"
                                    title="新分頁開啟"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                </div>
                              </div>
                              <div className="p-3 flex-grow flex flex-col justify-between min-w-0 bg-white">
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800 truncate text-[11px] mb-0.5" title={img.filename}>
                                    {img.filename}
                                  </p>
                                  {matchedProduct ? (
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="inline-block px-1 bg-emerald-50 text-emerald-800 border border-emerald-100 text-[8px] rounded font-extrabold flex-shrink-0 uppercase">
                                        已對應連結
                                      </span>
                                      <p className="text-[9px] text-slate-500 font-medium truncate min-w-0" title={matchedProduct.name}>
                                        {matchedProduct.name}
                                      </p>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1 min-w-0">
                                      <span className="inline-block px-1 bg-amber-50 text-amber-700 border border-amber-100 text-[8px] rounded font-bold flex-shrink-0 uppercase">
                                        未連結商品
                                      </span>
                                      <p className="text-[8px] text-slate-400 leading-tight truncate min-w-0">
                                        商品目錄中暫無匹配此 ID 的商品
                                      </p>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center justify-between text-[8px] text-slate-400 font-semibold font-mono border-t border-slate-50 pt-2 shrink-0">
                                  {img.size === 0 ? (
                                    <span className="text-rose-500 font-bold flex items-center gap-0.5 animate-pulse">⚠️ 空檔案</span>
                                  ) : (
                                    <span>{(img.size / 1024).toFixed(1)} KB</span>
                                  )}
                                  <span>{new Date(img.updatedAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>

            {/* Modal Footer Controls */}
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2 shrink-0">
              <button
                onClick={() => {
                  fetchServerImages();
                  showToast("已重新整理儲存資料夾！");
                }}
                className="py-2 px-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                重新整理目錄
              </button>
              
              <button
                onClick={() => setIsFolderExplorerOpen(false)}
                className="py-2.5 px-5 rounded-xl bg-slate-900 border border-slate-900 text-white font-bold hover:bg-slate-800 transition-all text-xs"
              >
                結束瀏覽
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {isAddProductOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 transition-all animate-fadeIn"
          onClick={() => setIsAddProductOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl relative border border-slate-105 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-slate-950 font-black text-sm md:text-base flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-600" />
                  手動新增自訂商品
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  手動建立具有自訂屬性與相片的全新目錄商品
                </p>
              </div>
              <button 
                onClick={() => setIsAddProductOpen(false)}
                className="p-1.5 rounded-lg border border-slate-150 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all font-bold"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleAddProductSubmit} className="flex-grow flex flex-col overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-4 flex-grow">
                
                {/* Image upload area */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    商品首圖
                  </label>
                  
                  <div className="flex gap-4 items-center">
                    {/* Preview box */}
                    <div className="w-24 h-24 rounded-2xl border-2 border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 relative">
                      {newProductImagePreview ? (
                        <img 
                          src={newProductImagePreview} 
                          alt="Preview" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center text-slate-400">
                          <ImageIcon className="w-8 h-8 mx-auto" />
                          <span className="text-[10px] block font-mono">暫無圖片</span>
                        </div>
                      )}
                    </div>

                    {/* Choose button / file info */}
                    <div className="flex-grow space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => document.getElementById("new-product-file-input")?.click()}
                          className="py-2 px-3.5 rounded-xl border border-slate-205 bg-white border-slate-200 text-slate-705 hover:bg-slate-50 hover:text-slate-900 transition-all text-xs font-bold flex items-center gap-1.5"
                        >
                          <Upload className="w-4 h-4 text-indigo-600" />
                          選擇圖片
                        </button>
                        {newProductImageFile && (
                          <button
                            type="button"
                            onClick={() => {
                              setNewProductImageFile(null);
                              setNewProductImagePreview("");
                            }}
                            className="text-xs font-bold text-rose-600 hover:text-rose-800"
                          >
                            移除
                          </button>
                        )}
                      </div>
                      <input 
                        id="new-product-file-input"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleProductImageChange}
                      />
                      <p className="text-[11px] text-slate-400 leading-normal">
                        支援格式: JPG, JPEG, PNG, WEBP。您的上傳相片將存儲並預設關聯為 <strong>{newProductId ? `${newProductId}.jpg` : "product-id.jpg"}</strong>。
                      </p>
                    </div>
                  </div>
                </div>

                {/* SKU / Id Fields */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      商品編號 ID (建議依貨號自動生成)
                    </label>
                    <input 
                      type="text"
                      placeholder="例如 id-12345"
                      value={newProductId}
                      onChange={(e) => setNewProductId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 border-slate-200 focus:border-slate-400 focus:bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs transition-all outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      商品單價 (HK$)
                    </label>
                    <input 
                      type="text"
                      placeholder="例如 61"
                      value={newProductPrice}
                      onChange={(e) => setNewProductPrice(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-205 border-slate-200 focus:border-slate-400 focus:bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs transition-all outline-none font-mono"
                    />
                  </div>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    商品名稱 *
                  </label>
                  <input 
                    type="text"
                    required
                    placeholder="例如 多芬滋養沐浴乳套裝"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs transition-all outline-none"
                  />
                </div>

                {/* Quantity */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    庫存數量控制 / 庫存狀態
                  </label>
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="例如 39 (留空代表長期充足 / 無限制)"
                      value={newProductQuantity}
                      onChange={(e) => setNewProductQuantity(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs transition-all outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block font-medium leading-normal">
                    提示：輸入「0」可將商品顯示為「暫無現貨」，或輸入大於 0 的正整數設定特定庫存量。
                  </span>
                </div>

                {/* Remarks */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    特別備註 / 產品備註
                  </label>
                  <textarea 
                    placeholder="可輸入詳細規格、尺碼說明、特別優惠或條款..."
                    value={newProductRemarks}
                    onChange={(e) => setNewProductRemarks(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-slate-400 focus:bg-white text-slate-900 rounded-xl px-3.5 py-2.5 text-xs transition-all outline-none resize-none"
                  />
                </div>

              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddProductOpen(false)}
                  className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium transition-all text-xs"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProduct}
                  className="py-2.5 px-5 rounded-xl bg-slate-900 border border-slate-900 text-white font-bold hover:bg-slate-800 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs font-bold"
                >
                  {isSubmittingProduct ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      正在建立中...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      建立商品
                    </>
                  )}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Google Sheet Connection Settings Settings Modal */}
      {isSheetSettingsOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 transition-all animate-fadeIn"
          onClick={() => setIsSheetSettingsOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-hidden shadow-2xl relative border border-slate-100 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-slate-950 font-black text-sm md:text-base flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-600" />
                  Google 試算表同步連結配置
                </h3>
                <p className="text-[11px] md:text-xs text-slate-500 mt-0.5">
                  配對編寫好的 Apps Script 即可開啟商品數據實時雙向更新
                </p>
              </div>
              <button 
                onClick={() => setIsSheetSettingsOpen(false)}
                className="p-1.5 rounded-lg border border-slate-150 hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Form */}
            <form onSubmit={handleSaveSheetSettings} className="flex flex-col flex-grow overflow-hidden">
              <div className="p-6 overflow-y-auto space-y-5 flex-grow">
                
                <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-xs font-bold text-slate-700 block">編輯時即時同步寫入</span>
                    <span className="text-[10px] text-slate-400">將前台對商品屬性的增刪改動實時寫入您的 Google 試算表</span>
                  </div>
                  <input 
                    type="checkbox"
                    checked={sheetSettings.enabled}
                    onChange={(e) => setSheetSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="w-4 h-4 text-indigo-600 focus:ring-indigo-500 rounded border-slate-300 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Google Apps Script 網頁應用程式 URL 網址
                  </label>
                  <input 
                    type="url"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={sheetSettings.appsScriptUrl}
                    onChange={(e) => setSheetSettings(prev => ({ ...prev, appsScriptUrl: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 focus:bg-white text-slate-900 text-xs font-mono rounded-xl px-3.5 py-3 outline-none focus:border-indigo-500 transition-all font-semibold"
                  />
                </div>

                {/* Setup Guide block */}
                <div className="pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowScriptGuide(!showScriptGuide)}
                    className="w-full py-2 text-xs text-indigo-600 hover:text-indigo-805 font-bold flex items-center justify-between transition-all"
                  >
                    <span className="flex items-center gap-1.5">
                      <Info className="w-4 h-4" />
                      2 分鐘極速配置同步寫入（點擊展開教學）
                    </span>
                    <span>{showScriptGuide ? "收起教學指南 ▲" : "展開教學指南 ▼"}</span>
                  </button>

                  {showScriptGuide && (
                    <div className="mt-3 bg-indigo-50/50 rounded-xl p-4 border border-indigo-100 text-xs text-slate-650 space-y-3 leading-relaxed animate-fadeIn">
                      <ol className="list-decimal pl-4 space-y-1.5 text-[11px]">
                        <li>打開對應您商品目錄的 Google 試算表。</li>
                        <li>在頂部菜單選擇 <strong>擴充功能 ➔ Apps Script</strong>。</li>
                        <li>將下方提供的最新範例代碼複製，並覆蓋貼上至程式編輯器。</li>
                        <li>點擊右上角 <strong>部署 ➔ 新增部署</strong>。</li>
                        <li>選取選單中的 <strong>網頁應用程式 (Web App)</strong>，並將「誰有權限存取」改為 <strong>所有人 (Anyone)</strong>，點擊部署。</li>
                        <li>複製產生的網頁應用程式部署網址，粘貼到上方的輸入欄框中即可！</li>
                      </ol>

                      <button
                        type="button"
                        onClick={() => {
                          const appsScriptCode = `/**
 * Google Apps Script Web App Template for Salestable.
 * Fully compatible with your existing actions (addProduct, addCustomer, writeTradeLog, deleteOrder, etc.)
 */

function doPost(e) {
  try {
    var param = JSON.parse(e.postData.contents);
    var action = param.action;
    
    // 1. Action: addProduct or updateProduct (Unified handler)
    if (action === 'addProduct' || action === 'updateProduct' || (!action && param.id)) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('raw');
      if (!sheet) {
        sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
      }
      
      var name = param.name;
      var id = param.id;
      var price = param.price;
      var quantity = param.quantity;
      var remarks = param.remarks;
      var username = param.username || "System";
      
      // Look if the product already exists in 'raw' by checking name or ID
      var data = sheet.getDataRange().getValues();
      var foundIndex = -1;
      for (var i = 1; i < data.length; i++) {
        var rowName = (data[i][2] || "").toString().trim();
        var rowId = (data[i][1] || "").toString().trim(); // Col B (SKU / ID)
        var rowIdColD = (data[i][3] || "").toString().trim(); // Col D
        if ((name && rowName === name.toString().trim()) || 
            (id && (rowId === id.toString().trim() || rowIdColD === id.toString().trim()))) {
          foundIndex = i;
          break;
        }
      }
      
      var rowToUpdate = foundIndex !== -1 ? foundIndex + 1 : sheet.getLastRow() + 1;
      
      if (foundIndex === -1) {
        // Appending a new row with default structure
        sheet.getRange(rowToUpdate, 1).setValue(new Date()); // Col A: Timestamp
        sheet.getRange(rowToUpdate, 2).setValue(id || "");  // Col B: SKU / ID
        sheet.getRange(rowToUpdate, 3).setValue(name || ""); // Col C: Product Name
        sheet.getRange(rowToUpdate, 4).setValue(id || "");  // Col D: Metadata / SKU ID
      } else {
        sheet.getRange(rowToUpdate, 2).setValue(id || "");
        sheet.getRange(rowToUpdate, 3).setValue(name || "");
      }
      
      // Update Price in Col O (Col 15) and set client tier prices (Col R/S/T) if present
      if (price !== undefined) {
        var pNum = parseFloat(price.toString().replace(/[$,\\s]/g, '')) || 0;
        sheet.getRange(rowToUpdate, 15).setValue(pNum); // Col O: Price
        sheet.getRange(rowToUpdate, 18).setValue(pNum); // Col R: Gold Price
        sheet.getRange(rowToUpdate, 19).setValue(pNum); // Col S: Silver Price
        sheet.getRange(rowToUpdate, 20).setValue(pNum); // Col T: Basic Price
      }
      
      var abVal = (quantity === "" || quantity === undefined) ? 1 : 0;
      var acVal = abVal === 1 ? "" : (quantity || "0");
      
      sheet.getRange(rowToUpdate, 28).setValue(abVal); // Col AB: UnlimitedStock
      sheet.getRange(rowToUpdate, 29).setValue(acVal); // Col AC: Stock / 庫存
      sheet.getRange(rowToUpdate, 30).setValue(remarks || ""); // Col AD: Remarks
      
      return ContentService.createTextOutput(JSON.stringify({ 
        status: 'success', 
        message: 'Product synced successfully in row ' + rowToUpdate 
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. Action: addCustomer
    if (action === 'addCustomer') {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('customer_cat') || 
                  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('顧客級數');
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'customer_cat or 顧客級數 sheet not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var name = param.name;
      var user = param.user;
      var district = param.district;
      var grade = param.grade;
      
      sheet.appendRow([name, user, grade, district]);
      
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Customer added successfully' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 3. Action: writeTradeLog (Supports INSERT and UPDATE)
    if (action === 'writeTradeLog') {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Trade_Log');
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Trade_Log sheet not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var rows = param.rows; // Array of arrays representing the rows
      if (!rows || rows.length === 0) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'No rows sent' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      // Ensure the sheet has enough columns to hold our 13-column wide schema
      var maxCols = sheet.getMaxColumns();
      var neededCols = Math.max(13, rows[0].length);
      if (maxCols < neededCols) {
        sheet.insertColumnsAfter(maxCols, neededCols - maxCols);
      }

      // Gather all unique Order IDs from Column M of the incoming rows (Index 12)
      var incomingIds = {};
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.length >= 13) {
          var orderId = row[12]; // Col M is index 12 (0-indexed)
          if (orderId) {
            incomingIds[orderId.toString().trim()] = true;
          }
        }
      }

      // Revert stock of previous matching rows in Trade_Log before applying new subtractions
      revertStockForOrders(incomingIds);
      
      // Update stock quantities in the 'raw' sheet, Col AC
      try {
        var rawSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('raw');
        if (!rawSheet) {
          rawSheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
        }
        if (rawSheet) {
          var rawValues = rawSheet.getDataRange().getValues();
          var rawHeaderRowIdx = 0;
          var rawTitleIdx = 2; // Col C default
          var rawUnlimitedIdx = 27; // Col AB default
          var rawStockIdx = 28; // Col AC default
          
          for (var i = 0; i < Math.min(rawValues.length, 10); i++) {
            var row = rawValues[i];
            var foundIdx = -1;
            for (var j = 0; j < row.length; j++) {
              if (row[j] && row[j].toString().toLowerCase().trim() === 'title') {
                foundIdx = j;
                break;
              }
            }
            if (foundIdx !== -1) {
              rawHeaderRowIdx = i;
              rawTitleIdx = foundIdx;
              for (var j = 0; j < row.length; j++) {
                var cellStr = (row[j] || '').toString().toLowerCase().trim();
                var normed = cellStr.replace(/[\\s_-]/g, '');
                if (normed.indexOf('unlimitedstock') !== -1) rawUnlimitedIdx = j;
                else if (normed === 'stock' || cellStr.indexOf('庫存') !== -1) rawStockIdx = j;
              }
              break;
            }
          }

          // Create index of product name to row index
          var prodToIndex = {};
          for (var rIdx = rawHeaderRowIdx + 1; rIdx < rawValues.length; rIdx++) {
            var pName = rawValues[rIdx][rawTitleIdx];
            if (pName && pName.toString().trim()) {
              prodToIndex[pName.toString().trim()] = rIdx;
            }
          }

          // Apply subtractions
          for (var i = 0; i < rows.length; i++) {
            var incomingRow = rows[i];
            if (incomingRow.length < 6) continue;
            var incomingProdName = (incomingRow[1] || '').toString().trim();
            var colD = incomingRow[3];
            var colF = incomingRow[5];
            
            var soldQty = 0;
            if (colD !== undefined && colF !== undefined) {
              var parseVal = function(v) {
                if (v === undefined || v === null || v === '') return 0;
                if (typeof v === 'number') return v;
                var parsed = parseFloat(v.toString().replace(/[$,\\s]/g, ''));
                return isNaN(parsed) ? 0 : parsed;
              };
              soldQty = parseVal(colD) * parseVal(colF);
            }

            if (incomingProdName && soldQty > 0) {
              var targetIndex = prodToIndex[incomingProdName];
              if (targetIndex !== undefined) {
                var rawRow = rawValues[targetIndex];
                var isUnlimited = rawRow[rawUnlimitedIdx] !== undefined && rawRow[rawUnlimitedIdx] !== null && rawRow[rawUnlimitedIdx].toString().trim() === '1';
                if (!isUnlimited) {
                  var currentStockStr = rawRow[rawStockIdx];
                  var currentStock = 0;
                  if (currentStockStr !== undefined && currentStockStr !== null && currentStockStr.toString().trim() !== '') {
                    var parsedStock = parseFloat(currentStockStr.toString().replace(/[$,\\s]/g, ''));
                    if (!isNaN(parsedStock)) {
                      currentStock = parsedStock;
                    }
                  }
                  var newStock = currentStock - soldQty;
                  rawValues[targetIndex][rawStockIdx] = newStock;
                  rawSheet.getRange(targetIndex + 1, rawStockIdx + 1).setValue(newStock);
                }
              }
            }
          }
        }
      } catch (stockError) {
        console.error('Error updating stock in raw sheet:', stockError);
      }
      
      // Delete existing rows with these matching order IDs in Column M (13th column)
      var uniqueIdsToDelete = Object.keys(incomingIds);
      if (uniqueIdsToDelete.length > 0) {
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          // Fetch Col M (Column 13) values (from row 2 to lastRow)
          var colMValues = sheet.getRange(2, 13, lastRow - 1, 1).getValues();
          
          // Iterate backward to avoid row index shifting during deletion
          for (var r = lastRow; r >= 2; r--) {
            var cellValue = colMValues[r - 2][0];
            if (cellValue && incomingIds[cellValue.toString().trim()]) {
              sheet.deleteRow(r);
            }
          }
        }
      }
      
      // Append the new rows to the Trade_Log sheet
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
      
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Trade log written/edited successfully' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3.5 Action: deleteOrder (Delete matching rows by Order ID in Column M)
    if (action === 'deleteOrder') {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Trade_Log');
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Trade_Log sheet not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var orderId = param.orderId;
      if (!orderId) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'No orderId provided' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // Revert stock for this order ID before deletion from Trade_Log
      var deleteMap = {};
      deleteMap[orderId.toString().trim()] = true;
      revertStockForOrders(deleteMap);
      
      // Ensure the sheet has enough columns to hold our 13-column wide schema
      var maxCols = sheet.getMaxColumns();
      if (maxCols < 13) {
        sheet.insertColumnsAfter(maxCols, 13 - maxCols);
      }
      
      var lastRow = sheet.getLastRow();
      var deletedCount = 0;
      if (lastRow > 1) {
        // Fetch Col M (Column 13) values (from row 2 onwards)
        var colMValues = sheet.getRange(2, 13, lastRow - 1, 1).getValues();
        
        // Iterate backward to avoid row index shifting during deletion
        for (var r = lastRow; r >= 2; r--) {
          var cellValue = colMValues[r - 2][0];
          if (cellValue && cellValue.toString().trim() === orderId.toString().trim()) {
            sheet.deleteRow(r);
            deletedCount++;
          }
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Deleted ' + deletedCount + ' rows for order ID ' + orderId }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 4. Action: updateGrades or Fallback to update grades (when body is raw dictionary of { name: grade })
    if (action === 'updateGrades' || (!action && Object.keys(param).length > 0)) {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('customer_cat') ||
                  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('顧客級數');
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'customer_cat or 顧客級數 sheet not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var gradesToUpdate = action === 'updateGrades' ? param.grades : param;
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        // Fetch Col A (Customer Name) values (from row 2 onwards)
        var nameValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
        var gradeRange = sheet.getRange(2, 3, lastRow - 1, 1);
        var gradeValues = gradeRange.getValues();
        
        var updatedCount = 0;
        for (var idx = 0; idx < nameValues.length; idx++) {
          var nameCell = nameValues[idx][0];
          if (nameCell) {
            var trimmedName = nameCell.toString().trim();
            if (gradesToUpdate[trimmedName] !== undefined) {
              gradeValues[idx][0] = gradesToUpdate[trimmedName];
              updatedCount++;
            }
          }
        }
        
        if (updatedCount > 0) {
          gradeRange.setValues(gradeValues);
        }
        
        return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'Updated ' + updatedCount + ' customer grades successfully' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      return ContentService.createTextOutput(JSON.stringify({ status: 'success', message: 'No rows to update' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action: ' + action }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var action = e.parameter.action;
    
    // 1. Action: getCustomers
    if (action === 'getCustomers') {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('customer_cat') ||
                  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('顧客級數');
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'customer_cat or 顧客級數 sheet not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return ContentService.createTextOutput(JSON.stringify([]))
          .setMimeType(ContentService.MimeType.JSON);
      }
      var values = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
      var customers = [];
      for (var i = 0; i < values.length; i++) {
        var row = values[i];
        if (row[0]) {
          customers.push({
            name: row[0].toString().trim(),
            sales: (row[1] || '').toString().trim(),
            grade: (row[2] || 'C').toString().trim(),
            district: (row[3] || '').toString().trim()
          });
        }
      }
      return ContentService.createTextOutput(JSON.stringify(customers))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. Action: getProducts (100% live uncached product fetch)
    if (action === 'getProducts') {
      var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('raw');
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'raw sheet not found' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var lastRow = sheet.getLastRow();
      if (lastRow < 1) {
        return ContentService.createTextOutput(JSON.stringify([]))
          .setMimeType(ContentService.MimeType.JSON);
      }
      
      var values = sheet.getDataRange().getValues();
      var headerRowIdx = 0;
      var titleIdx = 2; // Col C (index 2) is the item title
      var goldIdx = 17; // Col R
      var silverIdx = 18; // Col S
      var basicIdx = 19; // Col T
      var priceIdx = 14; // Col O
      var discountedPriceIdx = 15; // Col P
      var unlimitedIdx = 27; // Col AB
      var stockIdx = 28; // Col AC
      
      // Attempt to locate title row and other index headers dynamically
      for (var i = 0; i < Math.min(values.length, 10); i++) {
        var row = values[i];
        var foundIdx = -1;
        for (var j = 0; j < row.length; j++) {
          if (row[j] && row[j].toString().toLowerCase().trim() === 'title') {
            foundIdx = j;
            break;
          }
        }
        if (foundIdx !== -1) {
          headerRowIdx = i;
          titleIdx = foundIdx;
          
          for (var j = 0; j < row.length; j++) {
            var cellStr = (row[j] || '').toString().toLowerCase().trim();
            var normed = cellStr.replace(/[\\s_-]/g, '');
            if (cellStr.indexOf('gold') !== -1) goldIdx = j;
            else if (cellStr.indexOf('silver') !== -1) silverIdx = j;
            else if (cellStr.indexOf('basic') !== -1) basicIdx = j;
            else if (normed === 'price') priceIdx = j;
            else if (normed === 'discountedprice') discountedPriceIdx = j;
            else if (normed.indexOf('unlimitedstock') !== -1) unlimitedIdx = j;
            else if (normed === 'stock' || cellStr.indexOf('庫存') !== -1) stockIdx = j;
          }
          break;
        }
      }
      
      var parseNum = function(val) {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return val;
        var cleaned = val.toString().replace(/[$,\\s]/g, '');
        var parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      };
      
      var productsMap = {};
      var productsList = [];
      
      for (var rowIdx = headerRowIdx + 1; rowIdx < values.length; rowIdx++) {
        var row = values[rowIdx];
        var productName = row[titleIdx];
        if (productName && productName.toString().trim()) {
          var trimmed = productName.toString().trim();
          if (trimmed.toLowerCase() === 'title') continue;
          if (trimmed.length > 1) {
            
            var getPrice = function(colIdx) {
              var val = row[colIdx];
              if (val !== undefined && val !== null && val.toString().trim() !== '') return parseNum(val);
              var discounted = row[discountedPriceIdx];
              if (discounted !== undefined && discounted !== null && discounted.toString().trim() !== '') return parseNum(discounted);
              return parseNum(row[priceIdx]);
            };
            
            if (!productsMap[trimmed]) {
              productsMap[trimmed] = true;
              var isUnlimited = row[unlimitedIdx] !== undefined && row[unlimitedIdx] !== null && row[unlimitedIdx].toString().trim() === '1';
              var stockVal = undefined;
              if (row[stockIdx] !== undefined && row[stockIdx] !== null && row[stockIdx].toString().trim() !== '') {
                stockVal = parseNum(row[stockIdx]);
              }
              productsList.push({
                name: trimmed,
                prices: {
                  A: getPrice(goldIdx),
                  B: getPrice(silverIdx),
                  C: getPrice(basicIdx)
                },
                unlimitedStock: isUnlimited,
                stock: stockVal
              });
            }
          }
        }
      }
      
      return ContentService.createTextOutput(JSON.stringify(productsList))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput("Google Apps Script Web App is active and listening.");
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function revertStockForOrders(orderIdsMap) {
  try {
    var rawSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('raw');
    if (!rawSheet) {
      rawSheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    }
    var tradeLogSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Trade_Log');
    if (rawSheet && tradeLogSheet) {
      var rawValues = rawSheet.getDataRange().getValues();
      var rawHeaderRowIdx = 0;
      var rawTitleIdx = 2; // Col C default
      var rawUnlimitedIdx = 27; // Col AB default
      var rawStockIdx = 28; // Col AC default
      
      for (var i = 0; i < Math.min(rawValues.length, 10); i++) {
        var row = rawValues[i];
        var foundIdx = -1;
        for (var j = 0; j < row.length; j++) {
          if (row[j] && row[j].toString().toLowerCase().trim() === 'title') {
            foundIdx = j;
            break;
          }
        }
        if (foundIdx !== -1) {
          rawHeaderRowIdx = i;
          rawTitleIdx = foundIdx;
          for (var j = 0; j < row.length; j++) {
            var cellStr = (row[j] || '').toString().toLowerCase().trim();
            var normed = cellStr.replace(/[\\s_-]/g, '');
            if (normed.indexOf('unlimitedstock') !== -1) rawUnlimitedIdx = j;
            else if (normed === 'stock' || cellStr.indexOf('庫存') !== -1) rawStockIdx = j;
          }
          break;
        }
      }

      // Create index of product name to row index
      var prodToIndex = {};
      for (var rIdx = rawHeaderRowIdx + 1; rIdx < rawValues.length; rIdx++) {
        var pName = rawValues[rIdx][rawTitleIdx];
        if (pName && pName.toString().trim()) {
          prodToIndex[pName.toString().trim()] = rIdx;
        }
      }

      var lastRow = tradeLogSheet.getLastRow();
      if (lastRow > 1) {
        var tradeLogValues = tradeLogSheet.getRange(1, 1, lastRow, 13).getValues();
        for (var r = 1; r < lastRow; r++) {
          var logRow = tradeLogValues[r];
          if (logRow.length < 13) continue;
          var orderId = (logRow[12] || '').toString().trim();
          if (orderId && orderIdsMap[orderId]) {
            var prodName = (logRow[1] || '').toString().trim();
            var colD = logRow[3];
            var colF = logRow[5];
            
            var parseVal = function(v) {
              if (v === undefined || v === null || v === '') return 0;
              if (typeof v === 'number') return v;
              var parsed = parseFloat(v.toString().replace(/[$,\\s]/g, ''));
              return isNaN(parsed) ? 0 : parsed;
            };
            var revertQty = parseVal(colD) * parseVal(colF);
            
            if (prodName && revertQty > 0) {
              var targetIndex = prodToIndex[prodName];
              if (targetIndex !== undefined) {
                var rawRow = rawValues[targetIndex];
                var isUnlimited = rawRow[rawUnlimitedIdx] !== undefined && rawRow[rawUnlimitedIdx] !== null && rawRow[rawUnlimitedIdx].toString().trim() === '1';
                if (!isUnlimited) {
                  var currentStockStr = rawRow[rawStockIdx];
                  var currentStock = 0;
                  if (currentStockStr !== undefined && currentStockStr !== null && currentStockStr.toString().trim() !== '') {
                    var parsedStock = parseFloat(currentStockStr.toString().replace(/[$,\\s]/g, ''));
                    if (!isNaN(parsedStock)) {
                      currentStock = parsedStock;
                    }
                  }
                  var newStock = currentStock + revertQty;
                  rawValues[targetIndex][rawStockIdx] = newStock;
                  rawSheet.getRange(targetIndex + 1, rawStockIdx + 1).setValue(newStock);
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error in reverting stock:', err);
  }
}`;
                          navigator.clipboard.writeText(appsScriptCode);
                          showToast("試算表 Apps Script 代碼已複製到剪貼簿！");
                        }}
                        className="py-1.5 px-3 rounded-lg bg-indigo-600 text-white font-bold text-[10px] hover:bg-indigo-700 transition-all flex items-center gap-1.5 mx-auto cursor-pointer shadow-xs active:scale-95 mt-4"
                      >
                        <Copy className="w-3.5 h-3.5 text-white" />
                        <span>複製 Apps Script 程式碼</span>
                      </button>
                    </div>
                  )}
                </div>

              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsSheetSettingsOpen(false)}
                  className="py-2.5 px-4 rounded-xl border border-slate-205 border-slate-200 text-slate-600 hover:bg-slate-100 font-medium transition-all text-xs cursor-pointer"
                >
                  關閉
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="py-2.5 px-5 rounded-xl bg-slate-900 border border-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer"
                >
                  {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin text-white" /> : <Save className="w-4 h-4" />}
                  <span>儲存配置設定</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Cost Category Dock at bottom center (floating buttons from Col F of Cost tab) */}
      {viewMode === "customer" && Object.keys(costCategories.symbolToName || {}).length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl p-3 rounded-2xl w-[92vw] sm:w-[500px] animate-slideUp">
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => {
                setSelectedCostCategoryName("All");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer hover:scale-[1.03] active:scale-[0.97] duration-150 ${
                selectedCostCategoryName === "All"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-50 hover:bg-slate-100 hover:text-slate-900 text-slate-600 border border-slate-200/50"
              }`}
            >
              全部商品
            </button>
            {Object.entries(costCategories.symbolToName || {}).map(([symbol, name]) => {
              const count = products.filter(p => p.costCategoryName === name).length;
              if (count === 0) return null;
              return (
                <button
                  key={symbol}
                  onClick={() => {
                    setSelectedCostCategoryName(name);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.03] active:scale-[0.97] duration-150 ${
                    selectedCostCategoryName === name
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "bg-slate-50 hover:bg-slate-100 hover:text-slate-900 text-slate-600 border border-slate-200/50"
                  }`}
                >
                  <span>{name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                    selectedCostCategoryName === name ? "bg-indigo-500 text-indigo-50" : "bg-slate-200/60 text-slate-500"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* iOS Safari PWA Install Prompt Guide */}
      {showIosPrompt && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 bg-white border border-slate-200/85 shadow-2xl rounded-2xl p-4 z-50 animate-slideUp">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shrink-0 shadow-md">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-xs tracking-tight">將 SalesTable 安裝到 iPhone / iPad</h3>
                <p className="text-[10px] text-slate-500 font-medium">享受全螢幕、離線使用與極速載入體驗</p>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.setItem("ios_install_prompt_dismissed", "true");
                setShowIosPrompt(false);
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
              title="關閉提示"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-3.5 space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-start gap-2.5 text-xs">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 font-bold text-[10px] text-slate-700 shrink-0 mt-0.5">1</span>
              <div className="text-slate-600 font-medium leading-normal">
                請在 Safari 瀏覽器中，點擊下方的「<strong>分享</strong>」按鈕
                <div className="inline-flex items-center justify-center mx-1 bg-slate-100 border border-slate-200 rounded p-1 text-slate-700">
                  <Share className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 text-xs">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 font-bold text-[10px] text-slate-700 shrink-0 mt-0.5">2</span>
              <p className="text-slate-600 font-medium leading-normal">
                向上滑動選單，點擊「<strong>加入主畫面</strong>」
                <span className="inline-block px-1.5 py-0.5 ml-1 bg-indigo-50 border border-indigo-100 rounded text-[10px] text-indigo-600 font-bold">Add to Home Screen</span>
              </p>
            </div>
          </div>
          
          <div className="mt-3 text-[10px] text-center text-slate-400 font-medium border-t border-slate-50 pt-2 flex items-center justify-center gap-1">
            <span>✨ 像原生 App 一樣流暢，支援完全離線瀏覽</span>
          </div>
        </div>
      )}

      {/* High-Fidelity PDF / Print Catalog Preview Modal */}
      {isPreviewingPdfPrint && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex flex-col overflow-y-auto p-4 sm:p-6 md:p-10">
          <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden mx-auto my-auto border border-slate-100 animate-slideUp print:hidden">
            {/* Header bar */}
            <header className="p-4 sm:p-5 border-b border-slate-150 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base tracking-tight">列印預覽：PDF 商品目錄</h3>
                  <p className="text-[10px] text-slate-300">格式：A4 縱向排版 (適合另存為 PDF 文件)</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    window.print();
                  }}
                  className="py-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  <FileText className="w-4 h-4" />
                  列印 / 另存為 PDF
                </button>
                <button
                  onClick={() => setIsPreviewingPdfPrint(false)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </header>

            {/* Print Settings Guidelines bar */}
            <div className="p-4 bg-amber-50 border-b border-amber-200/60 text-amber-950 text-xs flex items-start gap-3">
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-900">💡 另存為 PDF 完美列印設定指引：</p>
                <ol className="list-decimal pl-4 mt-1 space-y-1 text-[11px] text-amber-800 font-medium">
                  <li>點擊右上角的「<strong>列印 / 另存為 PDF</strong>」，將目的地設為「<strong>另存為 PDF (Save as PDF)</strong>」。</li>
                  <li>在列印設定的<strong>「更多設定」</strong>(More settings) 中：
                    <ul className="list-disc pl-4 mt-0.5 space-y-0.5 font-bold text-amber-950">
                      <li>將「邊界」(Margins) 設為「<strong>無</strong>」(None) 或「預設」，以獲得最大顯示區域。</li>
                      <li>必須勾選「<strong>背景圖形</strong>」(Background graphics) 以顯示顏色背景與卡片樣式！</li>
                    </ul>
                  </li>
                  <li>此目錄在無網訊號狀態下亦可完美列印，圖片將自動載入您的手機離線快取。</li>
                </ol>
              </div>
            </div>

            {/* Document preview scrolling sheet */}
            <div className="p-6 sm:p-10 bg-slate-100 flex-grow overflow-y-auto max-h-[70vh] flex justify-center">
              {/* Virtual A4 representation for user visual validation */}
              <div className="w-[210mm] min-h-[297mm] bg-white shadow-lg p-10 border border-slate-200 text-slate-800 font-sans leading-relaxed text-sm box-border relative">
                
                {/* Visual Cover Page */}
                <div className="flex flex-col justify-between h-[250mm] border-b border-slate-100 pb-10 mb-10">
                  <div className="text-center pt-20 space-y-4">
                    <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mx-auto shadow-lg">
                      <Package className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 pt-4">產品目錄 / PRODUCT CATALOG</h1>
                    <p className="text-xs uppercase tracking-widest text-indigo-600 font-extrabold font-mono text-center">
                      Price Tier: {selectedPriceTier} 系列商品
                    </p>
                  </div>

                  <div className="text-center space-y-2 bg-slate-50 border border-slate-100 rounded-2xl p-6 max-w-md mx-auto">
                    <p className="text-xs text-slate-500 font-bold text-center">同步校對日期：{syncTime || "離線備份資料"}</p>
                    <p className="text-xs text-slate-400 font-medium text-center">共計 {products.length} 款商品 | {Object.keys(productsByCategory).length} 大分類</p>
                    <p className="text-[10px] text-slate-400 font-medium leading-normal pt-2 border-t border-slate-150 text-center">
                      本目錄包含高畫質商品照片與詳細規格。您可以在手機完全離線時隨時查閱並展示給客戶。
                    </p>
                  </div>
                </div>

                {/* Table of Contents */}
                <div className="page-break mb-10 pb-10 border-b border-slate-100">
                  <h2 className="text-xl font-bold text-slate-900 mb-6 pb-2 border-b-2 border-slate-900">
                    目錄分類索引 / Table of Contents
                  </h2>
                  <div className="space-y-4">
                    {Object.keys(productsByCategory).map((catName, idx) => (
                      <div key={catName} className="flex items-center justify-between text-xs border-b border-dashed border-slate-200 pb-2">
                        <span className="font-bold text-slate-800">{idx + 1}. {catName}</span>
                        <span className="text-slate-400 font-mono font-semibold">{productsByCategory[catName].length} 款商品</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Categories & Products loops */}
                {Object.keys(productsByCategory).map((catName, idx) => (
                  <div key={catName} className="mb-10 pb-10 border-b border-slate-100">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-indigo-600">
                      <h3 className="text-lg font-black text-indigo-900 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-indigo-600 rounded-sm inline-block"></span>
                        {catName}
                      </h3>
                      <span className="text-xs text-slate-400 font-bold">分類編號: {idx + 1}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      {productsByCategory[catName].map(p => (
                        <div key={p.id} className="border border-slate-150 rounded-xl p-3 flex gap-3 bg-slate-50/50 items-start">
                          {/* Photo */}
                          <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 relative">
                            <ProductImage
                              id={p.id}
                              name={p.name}
                              fallbackUrl={p.extraAttributes?.["Image URLs"]}
                              isOutOfStock={!p.hasStock}
                              version={imageVersion}
                            />
                          </div>
                          {/* Info */}
                          <div className="space-y-1 min-w-0 flex-grow">
                            <span className="text-[9px] font-mono font-bold text-slate-400 block uppercase">
                              SKU: {p.id}
                            </span>
                            <h4 className="font-bold text-xs text-slate-800 line-clamp-1">{p.name}</h4>
                            <div className="text-xs font-black text-slate-900">
                              {parseFloat(getProductPrice(p)) > 0 ? (
                                `HK$${parseFloat(getProductPrice(p)).toFixed(2)}`
                              ) : (
                                <span className="text-[10px] text-rose-500 font-extrabold bg-rose-50 px-1 py-0.2 rounded">價格由詢價決定</span>
                              )}
                            </div>
                            {p.extraAttributes?.["Merchant Remark"] && (
                              <p className="text-[9px] text-slate-400 line-clamp-1 italic">
                                備註: {p.extraAttributes?.["Merchant Remark"]}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden real-print output layout wrapper targeting browser printer */}
      <div id="print-catalog-container" className="hidden print:block bg-white p-10 font-sans text-slate-900">
        {/* Cover Page */}
        <div className="flex flex-col justify-between h-[270mm] pb-10">
          <div className="text-center pt-32 space-y-4">
            <h1 className="text-4xl font-black tracking-tight text-slate-900">產品目錄 / PRODUCT CATALOG</h1>
            <p className="text-sm uppercase tracking-widest text-indigo-600 font-extrabold font-mono pt-2">
              Price Tier: {selectedPriceTier} 系列商品
            </p>
            <div className="w-24 h-1 bg-indigo-600 mx-auto my-6"></div>
          </div>

          <div className="text-center space-y-2 max-w-md mx-auto pt-48">
            <p className="text-sm text-slate-600 font-bold">同步校對日期：{syncTime || "離線備份資料"}</p>
            <p className="text-xs text-slate-400 font-medium">共計 {products.length} 款商品 | {Object.keys(productsByCategory).length} 大分類</p>
            <p className="text-[10px] text-slate-400 font-medium pt-4">
              本產品目錄支援手機完全離線查閱
            </p>
          </div>
        </div>

        {/* Index Page */}
        <div className="print-page-break h-[270mm]">
          <h2 className="text-2xl font-black text-slate-900 mb-8 pb-3 border-b-4 border-slate-900">
            目錄索引 / Index
          </h2>
          <div className="space-y-4 max-w-xl">
            {Object.keys(productsByCategory).map((catName, idx) => (
              <div key={catName} className="flex items-center justify-between text-sm border-b border-dashed border-slate-200 pb-3">
                <span className="font-extrabold text-slate-800">{idx + 1}. {catName}</span>
                <span className="text-slate-500 font-mono font-bold">{productsByCategory[catName].length} 款商品</span>
              </div>
            ))}
          </div>
        </div>

        {/* Category Page Loop */}
        {Object.keys(productsByCategory).map((catName, idx) => (
          <div key={catName} className="print-page-break pb-10">
            <div className="flex items-center justify-between mb-6 pb-2 border-b-4 border-indigo-600">
              <h3 className="text-xl font-black text-indigo-900">
                {idx + 1}. {catName}
              </h3>
              <span className="text-xs text-slate-400 font-bold font-mono">共計 {productsByCategory[catName].length} 款商品</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {productsByCategory[catName].map(p => (
                <div key={p.id} className="border border-slate-200 rounded-xl p-4 flex gap-4 bg-slate-50/50 items-start">
                  {/* Photo */}
                  <div className="w-20 h-20 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 relative">
                    <ProductImage
                      id={p.id}
                      name={p.name}
                      fallbackUrl={p.extraAttributes?.["Image URLs"]}
                      isOutOfStock={!p.hasStock}
                      version={imageVersion}
                    />
                  </div>
                  {/* Info */}
                  <div className="space-y-1.5 min-w-0 flex-grow">
                    <span className="text-[10px] font-mono font-bold text-slate-400 block uppercase tracking-wide">
                      SKU ID: {p.id}
                    </span>
                    <h4 className="font-bold text-sm text-slate-800 leading-snug">{p.name}</h4>
                    <div className="text-sm font-black text-slate-900">
                      {parseFloat(getProductPrice(p)) > 0 ? (
                        `HK$${parseFloat(getProductPrice(p)).toFixed(2)}`
                      ) : (
                        <span className="text-[10px] text-rose-500 font-extrabold bg-rose-50 px-2 py-0.5 rounded">價格由詢價決定</span>
                      )}
                    </div>
                    {p.extraAttributes?.["Merchant Remark"] && (
                      <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-100">
                        備註: {p.extraAttributes?.["Merchant Remark"]}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
