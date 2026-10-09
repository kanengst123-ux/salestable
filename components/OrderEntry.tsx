
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, ShieldCheck, ArrowLeft, ArrowRight, ShoppingCart, ChevronRight, Search, Loader2, Plus, Minus, Trash2, Package, Box, Check, Star, ListOrdered, UserPlus, PackagePlus, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchCustomerGrades, fetchProducts, addCustomerToSheet, addProductToSheet } from '../services/dataService';
import { setCachedItem } from '../services/cacheService';
import { Product, OrderItem, Customer, SavedOrder, isOrderOwner } from '../types';
import { ProductThumbnail } from './ProductThumbnail';

export const CATEGORY_BUTTONS = [
  '奶粉',
  'PAMPERS',
  '花王尿片',
  '頭水',
  '滴露',
  '幸福',
  '必理痛',
  '李施德林'
] as const;

export const getProductCategoryString = (p: Product): string => {
  if (p.category && p.category.trim()) return p.category.trim();
  if (p.categories && p.categories.trim()) return p.categories.trim();
  if (Array.isArray(p.allValues) && p.allValues.length > 12 && p.allValues[12]) {
    const val = String(p.allValues[12]).trim();
    if (val) return val;
  }
  if (p.extraAttributes?.Categories && p.extraAttributes.Categories !== 'Google Sheet Sync') {
    const val = String(p.extraAttributes.Categories).trim();
    if (val) return val;
  }
  return '';
};

export const matchProductCategory = (p: Product, buttonName: string): boolean => {
  const cat = getProductCategoryString(p).toLowerCase();
  const name = (p.name || '').toLowerCase();
  const b = buttonName.toLowerCase().trim();

  // 1. Primary check: Col M (header: Categories) of 'raw' tab contains the button name
  if (cat.includes(b)) return true;

  // 2. Specific matching rules for brand / category variants in raw sheet:
  if (b === '奶粉') {
    return cat.includes('奶粉') || name.includes('奶粉');
  }
  if (b === 'pampers') {
    return cat.includes('pampers') || name.includes('pampers');
  }
  if (b === '花王尿片') {
    return (
      cat.includes('花王尿片') ||
      (cat.includes('花王') && (cat.includes('尿片') || cat.includes('褲'))) ||
      (name.includes('花王') && (name.includes('片') || name.includes('褲') || name.includes('merries'))) ||
      (name.includes('merries') && (name.includes('片') || name.includes('褲')))
    );
  }
  if (b === '頭水') {
    return cat.includes('頭水') || name.includes('洗髮') || name.includes('洗頭') || name.includes('頭水');
  }
  if (b === '滴露') {
    return cat.includes('滴露') || cat.includes('dettol') || name.includes('滴露') || name.includes('dettol');
  }
  if (b === '幸福') {
    return cat.includes('幸福') || name.includes('幸福');
  }
  if (b === '必理痛') {
    return cat.includes('必理痛') || name.includes('必理痛');
  }
  if (b === '李施德林') {
    return cat.includes('李施德林') || cat.includes('李施') || name.includes('李施德林') || name.includes('李施');
  }

  return name.includes(b);
};

interface OrderEntryProps {
  onBack: () => void;
  onSaveOrder?: (order: SavedOrder) => void;
  onShowOrderList?: () => void;
  editingOrder?: SavedOrder | null;
  onGenerateOrderId?: (userName: string) => string;
  initialCustomers?: Customer[];
  initialProducts?: Product[];
  savedOrders?: SavedOrder[];
  preSelectedCustomer?: string | null;
  onClearPreSelectedCustomer?: () => void;
  onCustomerAdded?: (name: string) => void;
  onProductAdded?: (product: Product) => void;
  onRefreshAll?: () => Promise<void>;
  currentRole?: string | null;
  onSelectRole?: (role: string) => void;
}

const OrderEntry: React.FC<OrderEntryProps> = ({ 
  onBack, 
  onSaveOrder, 
  onShowOrderList, 
  editingOrder, 
  onGenerateOrderId, 
  initialCustomers, 
  initialProducts, 
  savedOrders = [], 
  preSelectedCustomer = null, 
  onClearPreSelectedCustomer, 
  onCustomerAdded, 
  onProductAdded, 
  onRefreshAll,
  currentRole, 
  onSelectRole 
}) => {
  const [selectedRole, setSelectedRole] = useState<string | null>(() => {
    return currentRole || localStorage.getItem('ws_selected_role');
  });

  useEffect(() => {
    if (currentRole) {
      setSelectedRole(currentRole);
    }
  }, [currentRole]);

  // Guard: Each user can only edit their own orders
  useEffect(() => {
    if (editingOrder) {
      const active = selectedRole || currentRole || localStorage.getItem('ws_selected_role');
      if (active && !isOrderOwner(editingOrder, active)) {
        alert(`權限提示：您只能修改屬於自己的訂單！\n此訂單業務為：${editingOrder.salesName || '未知'}，您目前的身份為：${active}`);
        onBack();
      }
    }
  }, [editingOrder, selectedRole, currentRole, onBack]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(() => {
    if (editingOrder?.customerName) return editingOrder.customerName;
    if (preSelectedCustomer) return preSelectedCustomer;
    try {
      return localStorage.getItem('ws_draft_customer') || null;
    } catch {
      return null;
    }
  });
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers || []);

  useEffect(() => {
    if (initialCustomers && initialCustomers.length > 0) {
      setCustomers(initialCustomers);
    }
  }, [initialCustomers]);

  useEffect(() => {
    if (preSelectedCustomer) {
      setSelectedCustomer(preSelectedCustomer);
      onClearPreSelectedCustomer?.();
    }
  }, [preSelectedCustomer, onClearPreSelectedCustomer]);

  const [products, setProducts] = useState<Product[]>(initialProducts || []);
  const [selectedItems, setSelectedItems] = useState<OrderItem[]>(() => {
    if (editingOrder?.items && editingOrder.items.length > 0) return editingOrder.items;
    try {
      const stored = localStorage.getItem('ws_draft_items');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });
  const [remark, setRemark] = useState<string>(() => {
    if (editingOrder?.remark) return editingOrder.remark;
    try {
      return localStorage.getItem('ws_draft_remark') || '';
    } catch {
      return '';
    }
  });
  const [showRemarkInput, setShowRemarkInput] = useState(() => !!editingOrder?.remark || !!localStorage.getItem('ws_draft_remark'));

  useEffect(() => {
    if (!editingOrder) {
      if (selectedCustomer) {
        localStorage.setItem('ws_draft_customer', selectedCustomer);
      } else {
        localStorage.removeItem('ws_draft_customer');
      }
    }
  }, [selectedCustomer, editingOrder]);

  useEffect(() => {
    if (!editingOrder) {
      if (selectedItems && selectedItems.length > 0) {
        localStorage.setItem('ws_draft_items', JSON.stringify(selectedItems));
      } else {
        localStorage.removeItem('ws_draft_items');
      }
    }
  }, [selectedItems, editingOrder]);

  useEffect(() => {
    if (!editingOrder) {
      if (remark) {
        localStorage.setItem('ws_draft_remark', remark);
      } else {
        localStorage.removeItem('ws_draft_remark');
      }
    }
  }, [remark, editingOrder]);
  const [tempPrices, setTempPrices] = useState<Record<string, string>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(() => {
    try {
      return localStorage.getItem('ws_draft_category') || null;
    } catch {
      return null;
    }
  });
  const [categorySearchQuery, setCategorySearchQuery] = useState<string>(() => {
    try {
      return localStorage.getItem('ws_draft_category_search') || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    try {
      if (selectedCategory) {
        localStorage.setItem('ws_draft_category', selectedCategory);
      } else {
        localStorage.removeItem('ws_draft_category');
      }
    } catch {}
  }, [selectedCategory]);

  useEffect(() => {
    try {
      if (categorySearchQuery) {
        localStorage.setItem('ws_draft_category_search', categorySearchQuery);
      } else {
        localStorage.removeItem('ws_draft_category_search');
      }
    } catch {}
  }, [categorySearchQuery]);

  useEffect(() => {
    if (!selectedCustomer) {
      setSelectedCategory(null);
      setCategorySearchQuery('');
      try {
        localStorage.removeItem('ws_draft_category');
        localStorage.removeItem('ws_draft_category_search');
      } catch {}
    }
  }, [selectedCustomer]);

  const selectedCustomerInfo = useMemo(() => {
    return customers.find(c => c.name === selectedCustomer);
  }, [customers, selectedCustomer]);

  const getProductPrice = useCallback((product: Product): number => {
    const grade = selectedCustomerInfo?.grade || 'C';
    let rawTieredPrice: any = 0;
    if (product.prices && product.prices[grade] !== undefined && product.prices[grade] !== null && (product.prices[grade] as any) !== '') {
      rawTieredPrice = product.prices[grade];
    } else if ((product as any)[`price${grade}`] !== undefined) {
      rawTieredPrice = (product as any)[`price${grade}`];
    } else {
      rawTieredPrice = product.price || 0;
    }
    return typeof rawTieredPrice === 'number'
      ? rawTieredPrice
      : (parseFloat(String(rawTieredPrice).replace(/[^0-9.-]/g, '')) || 0);
  }, [selectedCustomerInfo]);

  const categoryFilteredProducts = useMemo(() => {
    if (!selectedCategory) return [];
    const matched = products.filter(p => matchProductCategory(p, selectedCategory));
    if (!categorySearchQuery.trim()) return matched;
    const q = categorySearchQuery.toLowerCase().trim();
    return matched.filter(p => 
      p.name.toLowerCase().includes(q) || 
      ((p.category || p.categories || '').toLowerCase().includes(q))
    );
  }, [products, selectedCategory, categorySearchQuery]);

  const toggleRemarkKeyword = (keyword: string, checked: boolean) => {
    if (checked) {
      setRemark(prev => {
        const trimmed = prev.trim();
        if (trimmed.includes(keyword)) return prev;
        return trimmed ? `${trimmed} ${keyword}` : keyword;
      });
    } else {
      setRemark(prev => {
        // Build regex that safely removes the keyword and normalizes spacing around it
        const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\s*${escaped}\\s*`, 'g');
        const updated = prev.replace(regex, ' ').trim();
        return updated;
      });
    }
  };

  const [favorites, setFavorites] = useState<Product[]>([]);

  // Load favorites when role changes or on mount
  useEffect(() => {
    if (!selectedRole) {
      setFavorites([]);
      return;
    }
    const key = `ws_favorites_${selectedRole}`;
    const savedFavorites = localStorage.getItem(key);
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch (e) {
        console.error('Failed to parse favorites', e);
        setFavorites([]);
      }
    } else {
      setFavorites([]);
    }
  }, [selectedRole]);

  const [activeTab, setActiveTab] = useState<'order' | 'favorites'>(() => {
    try {
      const stored = localStorage.getItem('ws_draft_order_subtab');
      if (stored === 'order' || stored === 'favorites') return stored;
    } catch {}
    return 'order';
  });

  useEffect(() => {
    try {
      localStorage.setItem('ws_draft_order_subtab', activeTab);
    } catch {}
  }, [activeTab]);
  const [productsLoading, setProductsLoading] = useState(initialProducts && initialProducts.length > 0 ? false : true);
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Modal states
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerDistrict, setNewCustomerDistrict] = useState('九龍東');
  const [newCustomerGrade, setNewCustomerGrade] = useState<'A' | 'B' | 'C'>('C');
  const [newProductName, setNewProductName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingLive, setIsRefreshingLive] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const handleRefreshLiveInfo = async () => {
    if (isRefreshingLive) return;
    setIsRefreshingLive(true);
    setRefreshMessage(null);
    try {
      // Fetch latest products (prices, A/B/C tier prices, stock levels) and customer grades from Google Sheet
      const [freshProducts, freshCustomers] = await Promise.all([
        fetchProducts(),
        fetchCustomerGrades()
      ]);

      if (freshProducts && freshProducts.length > 0) {
        setProducts(freshProducts);
        setCachedItem('products', freshProducts);

        // Also update prices of current items in the cart if their pricing was updated in the sheet
        const currentGrade = selectedCustomerInfo?.grade || 'C';
        setSelectedItems(prev => prev.map(item => {
          const matched = freshProducts.find(p => p.name === item.name);
          if (matched) {
            let rawTieredPrice: any = 0;
            if (matched.prices && matched.prices[currentGrade] !== undefined && matched.prices[currentGrade] !== null && (matched.prices[currentGrade] as any) !== '') {
              rawTieredPrice = matched.prices[currentGrade];
            } else if ((matched as any)[`price${currentGrade}`] !== undefined) {
              rawTieredPrice = (matched as any)[`price${currentGrade}`];
            } else {
              rawTieredPrice = matched.price || 0;
            }
            const newPrice = typeof rawTieredPrice === 'number'
              ? rawTieredPrice
              : (parseFloat(String(rawTieredPrice).replace(/[^0-9.-]/g, '')) || 0);
            
            if (newPrice > 0 && Math.abs(newPrice - item.price) > 0.001) {
              return { ...item, price: newPrice };
            }
          }
          return item;
        }));
      }

      if (freshCustomers && freshCustomers.length > 0) {
        setCustomers(freshCustomers);
        setCachedItem('customers', freshCustomers);
      }

      if (onRefreshAll) {
        await onRefreshAll();
      }

      setRefreshMessage('已更新最新價格與庫存！');
      setTimeout(() => setRefreshMessage(null), 3000);
    } catch (err) {
      console.error('Failed to refresh live info:', err);
      setRefreshMessage('更新失敗，請檢查網路');
      setTimeout(() => setRefreshMessage(null), 3000);
    } finally {
      setIsRefreshingLive(false);
    }
  };

  const salesPeople = ['EVA', 'KATIE', 'YO', 'KASEY'];
  const districts = ['新界東', '新界西', '九龍東', '九龍西', '港島'];

  const districtCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    districts.forEach(d => counts[d] = 0);
    
    customers.forEach(c => {
      const cSales = (c?.sales || (c as any)?.user || '').toString().trim().toUpperCase();
      const isVisible = selectedRole === 'Admin' 
        ? ['落鋪', 'HKTVMALL', '其他'].includes(c?.name || '')
        : cSales === (selectedRole || '').toUpperCase();
      
      if (isVisible && c?.district) {
        const dist = c.district.trim();
        if (counts[dist] !== undefined) {
          counts[dist]++;
        } else {
          const matched = districts.find(d => dist.includes(d) || d.includes(dist));
          if (matched) {
            counts[matched]++;
          }
        }
      }
    });
    return counts;
  }, [customers, selectedRole, districts]);

  useEffect(() => {
    const loadData = async () => {
      const hasCategories = initialProducts && initialProducts.length > 0 && initialProducts.some(p => p.category || p.categories || (p.allValues && p.allValues[12]));
      if (initialProducts && initialProducts.length > 0 && initialProducts.some(p => p.list !== undefined) && hasCategories) {
        setProducts(initialProducts);
        setProductsLoading(false);
        return;
      }
      setProductsLoading(true);
      try {
        const productData = await fetchProducts();
        setProducts(productData);
      } catch (e) {
        console.error('Failed to load data', e);
      } finally {
        setProductsLoading(false);
      }
    };
    loadData();
  }, [initialProducts]);

  // Save favorites to localStorage
  useEffect(() => {
    if (selectedRole) {
      localStorage.setItem(`ws_favorites_${selectedRole}`, JSON.stringify(favorites));
    }
  }, [favorites, selectedRole]);

  // Save selected role to localStorage and notify parent
  useEffect(() => {
    if (selectedRole) {
      localStorage.setItem('ws_selected_role', selectedRole);
      onSelectRole?.(selectedRole);
    }
  }, [selectedRole, onSelectRole]);

  // Reset district search when role changes
  useEffect(() => {
    setSelectedDistrict(null);
    setSearchQuery('');
  }, [selectedRole]);

  const parseOuterBoxInfo = (name: string) => {
    if (name.includes('/')) {
      const match = name.match(/(\d+)\/([^\s\x00-\x1F\x7F]+)/);
      if (match) {
        return {
          units: parseInt(match[1]),
          unitName: match[2].charAt(0)
        };
      }
    }
    return null;
  };

  // Saved orders reservation: stock is deducted only upon pressing '入機'.
  // Draft and held orders do not reduce available stock until '入機' is pressed.
  const otherOrdersReservedMap = useMemo(() => {
    return new Map<string, number>();
  }, []);

  // When editing an order that already had its stock deducted (keyed-in order),
  // those quantities were ALREADY subtracted from product.stock!
  // We track the baseline deducted quantities so only the NET delta (new - original) affects available stock.
  const editingOrderDeductedMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!editingOrder) return map;
    const wasDeducted = Boolean(editingOrder.stockDeducted || editingOrder.isKeyedIn);
    if (!wasDeducted) return map;

    const sourceItems = (editingOrder.deductedItems && editingOrder.deductedItems.length > 0)
      ? editingOrder.deductedItems
      : (editingOrder.items || []);

    sourceItems.forEach(it => {
      if (it && it.name) {
        const norm = it.name.trim();
        map.set(norm, (map.get(norm) || 0) + (Number(it.quantity) || 0));
      }
    });
    return map;
  }, [editingOrder]);

  const reservedQtyMap = useMemo(() => {
    const map = new Map<string, number>(otherOrdersReservedMap);
    
    // 1. Group current selected quantities by product name
    const currentSelectedMap = new Map<string, number>();
    selectedItems.forEach(item => {
      if (item && item.name) {
        const norm = item.name.trim();
        const q = Number(item.quantity) || 0;
        currentSelectedMap.set(norm, (currentSelectedMap.get(norm) || 0) + q);
      }
    });

    // 2. All product keys across currently selected and previously deducted items
    const allProdKeys = new Set([...currentSelectedMap.keys(), ...editingOrderDeductedMap.keys()]);
    allProdKeys.forEach(pName => {
      const currentQty = currentSelectedMap.get(pName) || 0;
      const alreadyDeducted = editingOrderDeductedMap.get(pName) || 0;
      const netChange = currentQty - alreadyDeducted;
      map.set(pName, (map.get(pName) || 0) + netChange);
    });

    return map;
  }, [otherOrdersReservedMap, selectedItems, editingOrderDeductedMap]);

  const getRemainingStock = useCallback((product: Product) => {
    if (product.unlimitedStock) return Infinity;
    const normName = product.name.trim();
    const baseStock = product.stock ?? 0;
    const reducedQty = reservedQtyMap.get(normName) || 0;
    return baseStock - reducedQty;
  }, [reservedQtyMap]);

  const getMaxStockForOrder = useCallback((productName: string) => {
    const norm = productName.trim();
    const prod = products.find(p => p.name.trim() === norm);
    if (!prod || prod.unlimitedStock) return Infinity;
    const reservedByOthers = otherOrdersReservedMap.get(norm) || 0;
    const alreadyDeducted = editingOrderDeductedMap.get(norm) || 0;
    return (prod.stock ?? 0) + alreadyDeducted - reservedByOthers;
  }, [products, otherOrdersReservedMap, editingOrderDeductedMap]);

  const totalOrderAmount = useMemo(() => {
    return selectedItems.reduce((acc, item) => acc + (item.quantity * item.price), 0);
  }, [selectedItems]);

  const handleAddProduct = (product: Product) => {
    const isSpecialNegativeProduct = 
      product.name.includes('上單收多$') || 
      product.name.includes('扣上單 $') ||
      product.name.includes('扣上單$') ||
      product.name.trim() === '上單收多$' ||
      product.name.trim() === '扣上單 $' ||
      product.name.trim() === '扣上單$';

    const boxInfo = parseOuterBoxInfo(product.name);
    // Determine price based on selected customer's grade
    const grade = selectedCustomerInfo?.grade || 'C';
    let rawTieredPrice: any = 0;
    if (product.prices && product.prices[grade] !== undefined && product.prices[grade] !== null && (product.prices[grade] as any) !== '') {
      rawTieredPrice = product.prices[grade];
    } else if ((product as any)[`price${grade}`] !== undefined) {
      rawTieredPrice = (product as any)[`price${grade}`];
    } else {
      rawTieredPrice = product.price || 0;
    }
    let tieredPrice = typeof rawTieredPrice === 'number'
      ? rawTieredPrice
      : (parseFloat(String(rawTieredPrice).replace(/[^0-9.-]/g, '')) || 0);

    if (isSpecialNegativeProduct) {
      tieredPrice = -Math.abs(tieredPrice);
    }

    const defaultStep = boxInfo ? boxInfo.units : 12;
    // Allow negative stock when making orders - do not restrict qtyToAdd
    const qtyToAdd = isSpecialNegativeProduct ? -1 : defaultStep;

    setSelectedItems(prev => {
      const existingIndex = prev.findIndex(item => item.name === product.name);
      if (existingIndex !== -1 && !isSpecialNegativeProduct) {
        const item = prev[existingIndex];
        const step = item.isOuterBox ? (Number(item.unitsPerBox) || (boxInfo ? boxInfo.units : 12)) : 1;
        return prev.map((it, idx) => {
          if (idx === existingIndex) {
            return { ...it, quantity: (Number(it.quantity) || 0) + step };
          }
          return it;
        });
      }

      const boxUnits = boxInfo ? boxInfo.units : 12;
      const isBoxMode = isSpecialNegativeProduct ? false : (qtyToAdd >= boxUnits);

      const newItem: OrderItem = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: product.name,
        quantity: qtyToAdd,
        price: tieredPrice,
        isOuterBox: isBoxMode,
        unitsPerBox: boxUnits,
        outerBoxUnit: boxInfo ? boxInfo.unitName : "打"
      };
      return [newItem, ...prev];
    });
    // Do not clear productSearchQuery so user can select multiple items from the dropdown
  };

  const handleReduceProduct = (product: Product) => {
    setSelectedItems(prev => {
      const existingIndex = prev.findIndex(item => item.name === product.name);
      if (existingIndex === -1) return prev;

      const item = prev[existingIndex];
      const boxInfo = parseOuterBoxInfo(product.name);
      const isSpecialNegativeProduct = 
        product.name.includes('上單收多$') || 
        product.name.includes('扣上單 $') ||
        product.name.includes('扣上單$') ||
        product.name.trim() === '上單收多$' ||
        product.name.trim() === '扣上單 $' ||
        product.name.trim() === '扣上單$';

      if (isSpecialNegativeProduct) {
        return prev.filter((_, idx) => idx !== existingIndex);
      }

      const step = item.isOuterBox ? (Number(item.unitsPerBox) || (boxInfo ? boxInfo.units : 12)) : 1;
      const curQty = Number(item.quantity) || 0;

      if (curQty <= step) {
        // Cancel the selection by removing this item from the order
        return prev.filter((_, idx) => idx !== existingIndex);
      } else {
        // Reduce quantity by one box/unit
        return prev.map((it, idx) => {
          if (idx === existingIndex) {
            return { ...it, quantity: curQty - step };
          }
          return it;
        });
      }
    });
  };

  const handleUpdateItem = (id: string, updates: Partial<OrderItem>) => {
    setSelectedItems(prev => prev.map(item => {
      if (item.id === id) {
        const merged = { ...item, ...updates };
        if (merged.price !== undefined) {
          merged.price = typeof merged.price === 'number'
            ? merged.price
            : (parseFloat(String(merged.price).replace(/[^0-9.-]/g, '')) || 0);
        }
        if (merged.quantity !== undefined) {
          let q = typeof merged.quantity === 'number'
            ? merged.quantity
            : (parseFloat(String(merged.quantity)) || 0);

          const isSpecialNegativeProduct = 
            item.name.includes('上單收多$') || 
            item.name.includes('扣上單 $') ||
            item.name.includes('扣上單$');

          if (!isSpecialNegativeProduct && q < 0) {
            q = 0;
          }
          merged.quantity = q;
        }
        return merged;
      }
      return item;
    }));
  };

  const handleRemoveItem = (id: string) => {
    setSelectedItems(prev => prev.filter(item => item.id !== id));
  };

  const toggleFavorite = (product: Product) => {
    setFavorites(prev => {
      const isFav = prev.some(p => p.name === product.name);
      if (isFav) {
        return prev.filter(p => p.name !== product.name);
      }
      return [...prev, product];
    });
  };

  const isFavorite = (productName: string) => {
    return favorites.some(p => p.name === productName);
  };

  const handleFinalSave = () => {
    if (!selectedCustomer || selectedItems.length === 0) return;
    
    // Verify item quantities (allow negative stock, but quantity must be greater than 0)
    for (const item of selectedItems) {
      const isSpecial = item.name.includes('上單收多$') || item.name.includes('扣上單');
      if (isSpecial) continue;
      if (item.quantity <= 0) {
        alert(`貨品「${item.name}」數量必須大於 0！`);
        return;
      }
    }

    const totalAmount = selectedItems.reduce((acc, item) => acc + (item.quantity * item.price), 0);
    const activeUserName = selectedRole || currentRole || localStorage.getItem('ws_selected_role') || 'Unknown';
    
    // Guard: Each user can only edit their own orders
    if (editingOrder && !isOrderOwner(editingOrder, activeUserName)) {
      alert(`權限提示：您只能修改屬於自己的訂單！\n此訂單業務為：${editingOrder.salesName || '未知'}，您目前的身份為：${activeUserName}`);
      return;
    }

    const computedId = editingOrder?.id || onGenerateOrderId?.(activeUserName) || `${Date.now()}`;
    
    const order: SavedOrder = {
      id: computedId,
      date: editingOrder?.date || new Date().toISOString(),
      customerName: selectedCustomer,
      orderAmount: totalAmount,
      salesName: editingOrder?.salesName || activeUserName,
      remark: remark,
      items: selectedItems,
      isKeyedIn: false,
      isHeld: editingOrder?.isHeld ?? false,
      stockDeducted: false,
      deductedItems: undefined,
      updatedAt: Date.now()
    };
    
    onSaveOrder?.(order);
    // Reset state & clear persistent draft
    setSelectedItems([]);
    setRemark('');
    setSelectedCustomer(null);
    setSelectedCategory(null);
    setCategorySearchQuery('');
    try {
      localStorage.removeItem('ws_draft_customer');
      localStorage.removeItem('ws_draft_items');
      localStorage.removeItem('ws_draft_remark');
      localStorage.removeItem('ws_draft_category');
      localStorage.removeItem('ws_draft_category_search');
      localStorage.removeItem('ws_draft_order_subtab');
    } catch {}
  };

  const handleAddCustomerConfirm = async () => {
    if (!newCustomerName.trim() || !selectedRole) return;
    setIsSubmitting(true);
    const addedCustomerName = newCustomerName.trim();
    try {
      const success = await addCustomerToSheet(addedCustomerName, selectedRole, newCustomerDistrict, newCustomerGrade);
      if (success) {
        // Refresh customer list
        const customerData = await fetchCustomerGrades();
        setCustomers(customerData);
        setSelectedCustomer(addedCustomerName);
        if (onCustomerAdded) {
          onCustomerAdded(addedCustomerName);
        }
        setNewCustomerName('');
        setShowAddCustomerModal(false);
        alert('客戶已成功添加！');
      }
    } catch (error) {
      console.error('Failed to add customer:', error);
      alert('添加客戶失敗，請重試。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddProductConfirm = async () => {
    if (!newProductName.trim()) return;
    setIsSubmitting(true);
    try {
      const activeUser = selectedRole || 'Unknown';
      const trimmedName = newProductName.trim();
      const res = await addProductToSheet(trimmedName, activeUser);
      if (res && res.success) {
        // Construct the newly added product with list: '0' so it is immediately searchable and selectable
        const newProd: Product = {
          id: res.id || `${activeUser}${Date.now()}`,
          name: trimmedName,
          price: 0,
          prices: { A: 0, B: 0, C: 0 },
          unlimitedStock: true,
          list: '0'
        };
        setProducts(prev => {
          const filtered = prev.filter(p => p.name.trim() !== trimmedName);
          return [newProd, ...filtered];
        });
        onProductAdded?.(newProd);
        setProductSearchQuery(trimmedName);
        setNewProductName('');
        setShowAddProductModal(false);
        alert('產品已成功添加！已在搜尋欄為您顯示該產品。');
      } else {
        alert('添加產品失敗，請重試。');
      }
    } catch (error) {
      console.error('Failed to add product:', error);
      alert('添加產品失敗，請重試。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!productSearchQuery.trim()) return [];
    const query = productSearchQuery.toLowerCase();
    return products.filter(p => {
      const nameMatches = (p?.name || '').toLowerCase().includes(query);
      if (!nameMatches) return false;
      const listVal = p?.list !== undefined && p?.list !== null ? String(p.list).trim() : '';
      return listVal === '0';
    });
  }, [products, productSearchQuery]);

  const filteredCustomers = useMemo(() => {
    if (!selectedRole) return [];
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return customers
        .filter(c => {
          const cSales = (c?.sales || (c as any)?.user || '').toString();
          return (c?.name || '').toLowerCase().includes(query) || 
            cSales.toLowerCase().includes(query) ||
            (c?.district && c.district.toLowerCase().includes(query));
        })
        .sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'zh-HK'));
    }

    let baseList: Customer[] = [];
    if (selectedRole === 'Admin') {
      baseList = customers.filter(c => ['落鋪', 'HKTVMALL', '其他'].includes(c?.name || ''));
    } else {
      baseList = customers.filter(c => {
        const cSales = (c?.sales || (c as any)?.user || '').toString().trim().toUpperCase();
        return cSales === selectedRole.toUpperCase();
      });
    }

    if (selectedDistrict) {
      baseList = baseList.filter(c => {
        if (!c?.district) return false;
        const dist = c.district.trim();
        return dist === selectedDistrict || dist.includes(selectedDistrict) || selectedDistrict.includes(dist);
      });
    }

    return [...baseList].sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'zh-HK'));
  }, [customers, selectedRole, searchQuery, selectedDistrict]);

  const renderModals = () => (
    <>
      {/* Add Customer Modal */}
      <AnimatePresence>
        {showAddCustomerModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddCustomerModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-100 rounded-2xl">
                  <UserPlus className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Add New Customer</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adding to customer_cat (Col A)</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Customer Name</label>
                  <input 
                    type="text"
                    autoFocus
                    placeholder="Enter customer name..."
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">District / 區域</label>
                  <div className="grid grid-cols-3 gap-2">
                    {districts.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setNewCustomerDistrict(d)}
                        className={`py-2 px-1 rounded-xl text-xs font-black transition-all border ${
                          newCustomerDistrict === d
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Customer Grade / 客戶級別 (Col C)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['A', 'B', 'C'] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setNewCustomerGrade(g)}
                        className={`py-2 px-1 rounded-xl text-xs font-black transition-all border ${
                          newCustomerGrade === g
                            ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-600/10'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {g} 級
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowAddCustomerModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={handleAddCustomerConfirm}
                    disabled={isSubmitting || !newCustomerName.trim()}
                    className="flex-1 px-4 py-3 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                    CONFIRM
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Product Modal */}
      <AnimatePresence>
        {showAddProductModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddProductModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-emerald-100 rounded-2xl">
                  <PackagePlus className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">登記新貨品</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Adding to raw (Col C)</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Product Name</label>
                  <input 
                    type="text"
                    autoFocus
                    placeholder="Enter product name..."
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setShowAddProductModal(false)}
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-xs font-black text-slate-500 hover:bg-slate-50 transition-colors"
                  >
                    CANCEL
                  </button>
                  <button 
                    onClick={handleAddProductConfirm}
                    disabled={isSubmitting || !newProductName.trim()}
                    className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting && <Loader2 className="w-3 h-3 animate-spin" />}
                    CONFIRM
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );

  const renderFloatingBackButton = () => (
    <button 
      type="button"
      onClick={onBack}
      className="fixed bottom-4 left-4 z-[9999] flex items-center gap-1.5 px-3.5 py-2 bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700/60 rounded-full shadow-2xl backdrop-blur-md active:scale-95 transition-all group cursor-pointer text-xs font-bold pointer-events-auto"
      title="返回主頁"
    >
      <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform text-blue-400" />
      <span>返回主頁</span>
    </button>
  );

  if (selectedCustomer) {
    return (
      <div className="h-[100dvh] max-h-[100dvh] w-full bg-white animate-in fade-in duration-300 flex flex-col overflow-hidden">
        {/* Top Layer: Product Search Box */}
        <div className="sticky top-0 z-[55] bg-white/80 backdrop-blur-md px-2 sm:px-4 py-2.5 border-b border-slate-100 shadow-sm">
          <div className="w-full max-w-md mx-auto relative flex items-center gap-2">
            <button 
              onClick={() => setSelectedCustomer(null)}
              className="p-2 -ml-1 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="落單 (搜尋產品名稱)"
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 sm:py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-bold text-base sm:text-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 shadow-inner"
              />
              {productSearchQuery && (
                <button
                  type="button"
                  onClick={() => setProductSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/70 rounded-full transition-colors"
                  title="清除搜尋"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowAddProductModal(true)}
              className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm flex-shrink-0"
              title="登記新貨品"
            >
              <PackagePlus className="w-5 h-5" />
            </button>
            {onShowOrderList && (
              <button 
                onClick={onShowOrderList}
                className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm flex-shrink-0"
                title="Order List"
              >
                <ListOrdered className="w-5 h-5" />
              </button>
            )}
          </div>
          
          {/* Search Results Dropdown */}
          {productSearchQuery && (
            <>
              {/* Backdrop to dismiss dropdown by clicking outside */}
              <div 
                className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-[0.5px]" 
                onClick={() => setProductSearchQuery('')} 
              />
              <div className="max-w-md mx-auto relative z-50">
                <div 
                  className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[55vh] overflow-y-auto custom-scrollbar ring-8 ring-black/5 flex flex-col"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                >
                  {productsLoading ? (
                    <div className="p-4 text-center text-slate-300">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      <p className="text-xs font-black uppercase tracking-widest">Searching...</p>
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-base font-bold uppercase tracking-widest">
                      找不到產品
                    </div>
                  ) : (
                    <>
                      <div className="divide-y divide-slate-100">
                        {filteredProducts.slice(0, 60).map((p, idx) => {
                          const remaining = getRemainingStock(p);
                          const isUnlimited = !!p.unlimitedStock;
                          
                          const matchingItems = selectedItems.filter(item => item.name === p.name);
                          const isAdded = matchingItems.length > 0;
                          const totalQty = matchingItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
                          const firstItem = matchingItems[0];
                          const boxUnits = firstItem ? (Number(firstItem.unitsPerBox) || 12) : 12;
                          const isBoxMode = firstItem ? firstItem.isOuterBox : true;
                          const displayQtyText = isBoxMode && boxUnits > 0
                            ? `${Math.round((totalQty / boxUnits) * 10) / 10} ${firstItem?.outerBoxUnit || '箱'}`
                            : `${totalQty}`;
                          const price = getProductPrice(p);

                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                handleAddProduct(p);
                              }}
                              className={`w-full flex items-center justify-between p-3.5 transition-colors group text-left touch-manipulation cursor-pointer ${
                                isAdded ? 'bg-blue-50/50 hover:bg-blue-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 flex-1 pr-2 min-w-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFavorite(p);
                                  }}
                                  className={`p-1.5 rounded-md transition-colors ${
                                    isFavorite(p.name) ? 'text-yellow-400' : 'text-slate-300 hover:text-yellow-300'
                                  }`}
                                >
                                  <Star className={`w-4 h-4 sm:w-5 sm:h-5 ${isFavorite(p.name) ? 'fill-current' : ''}`} />
                                </button>
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-base sm:text-lg font-black leading-snug break-words text-slate-800 group-hover:text-blue-700">{p.name}</span>
                                    {isAdded && (
                                      <span className="text-xs sm:text-sm font-black text-blue-600 bg-blue-100 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                                        已選 {displayQtyText}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <ProductThumbnail product={p} size="sm" />
                                    <span className="text-sm sm:text-base font-black text-blue-700 tabular-nums">
                                      ${price.toFixed(2)}
                                    </span>
                                    <span className="text-slate-300">•</span>
                                    <span className={`text-xs sm:text-sm font-bold ${
                                      isUnlimited ? 'text-slate-400' : (remaining < 0) ? 'text-rose-600' : (remaining === 0) ? 'text-rose-600' : (remaining < 10) ? 'text-amber-600' : 'text-slate-500'
                                    }`}>
                                      {isUnlimited 
                                        ? '庫存: 無限制' 
                                        : (remaining < 0)
                                        ? `剩餘庫存: ${remaining} (負庫存)`
                                        : (remaining === 0) 
                                        ? '剩餘庫存: 0' 
                                        : (remaining < 10) 
                                        ? `剩餘庫存: ${remaining} (庫存緊張)` 
                                        : `剩餘庫存: ${remaining}`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div 
                                className="flex items-center gap-2 flex-shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  type="button"
                                  disabled={!isAdded}
                                  onClick={() => handleReduceProduct(p)}
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                                    isAdded 
                                      ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 active:scale-90 shadow-sm' 
                                      : 'bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed opacity-40'
                                  }`}
                                  title={isAdded ? "減少或取消選取" : "尚未選取"}
                                >
                                  <Minus className="w-4 h-4 stroke-[3]" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAddProduct(p)}
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                                    isAdded 
                                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-500/30 active:scale-90' 
                                      : 'bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 shadow-sm active:scale-90'
                                  }`}
                                  title="增加選取"
                                >
                                  <Plus className="w-4 h-4 stroke-[3]" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {filteredProducts.length > 60 && (
                        <div className="p-3 text-center text-xs sm:text-sm text-slate-400 bg-slate-50 font-bold border-t border-slate-100">
                          顯示前 60 項結果，請輸入更多關鍵字以縮小搜尋範圍
                        </div>
                      )}

                      {/* Sticky Footer: Order Items count & Finish Selection Button */}
                      <div className="sticky bottom-0 bg-white/95 backdrop-blur-sm border-t border-slate-100 p-3 px-4 flex items-center justify-between shadow-lg mt-auto">
                        <span className="text-sm sm:text-base text-slate-700 font-bold">
                          已加入訂單：<span className="text-blue-600 font-black">{selectedItems.length}</span> 項貨品
                        </span>
                        <button
                          type="button"
                          onClick={() => setProductSearchQuery('')}
                          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-sm sm:text-base font-black rounded-xl shadow-sm transition-all flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>完成選擇</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Scrollable Content: Selected Products or Favorites */}
        <div className="flex-1 overflow-hidden bg-slate-50/30 flex flex-col relative">
          <div className="flex-1 relative overflow-hidden">
            <AnimatePresence mode="wait">
              {selectedCategory ? (
                <motion.div
                  key={`category-page-${selectedCategory}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute inset-0 overflow-y-auto px-2 sm:px-4 pt-3 pb-24 custom-scrollbar bg-slate-50/40"
                >
                  <div className="w-full max-w-7xl mx-auto space-y-3">
                    {/* Category Page Top Navigation Header */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-xs space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => { setSelectedCategory(null); setCategorySearchQuery(''); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs transition-all active:scale-95 border border-slate-200"
                        >
                          <ArrowLeft className="w-4 h-4 text-blue-600" />
                          <span>返回訂單</span>
                        </button>

                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs sm:text-sm font-black bg-blue-600 text-white px-3 py-1 rounded-xl shadow-xs truncate">
                            {selectedCategory}
                          </span>
                          <span className="text-[11px] sm:text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg shrink-0">
                            {categoryFilteredProducts.length} 款
                          </span>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[11px] font-bold text-slate-600 block truncate max-w-[120px]">
                            {selectedCustomer}
                          </span>
                          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                            Grade {selectedCustomerInfo?.grade}
                          </span>
                        </div>
                      </div>

                      {/* Quick category switch pills */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none flex-nowrap">
                        {CATEGORY_BUTTONS.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => { setSelectedCategory(cat); setCategorySearchQuery(''); }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-black whitespace-nowrap transition-all ${
                              selectedCategory === cat
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>

                      {/* In-category search input */}
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={categorySearchQuery}
                          onChange={(e) => setCategorySearchQuery(e.target.value)}
                          placeholder={`搜尋 ${selectedCategory} 貨品名稱或規格...`}
                          className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        />
                        {categorySearchQuery && (
                          <button
                            type="button"
                            onClick={() => setCategorySearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Products List in Category - Responsive Multiple Items Per Row Grid */}
                    {categoryFilteredProducts.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 bg-white border border-slate-200 rounded-2xl">
                        <p className="font-bold text-sm">此分類暫無匹配貨品</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
                        {categoryFilteredProducts.map((p) => {
                          const existingItem = selectedItems.find(it => it.name === p.name);
                          const price = getProductPrice(p);
                          const rem = getRemainingStock(p);
                          const isSelected = !!existingItem;

                          return (
                            <div
                              key={p.name}
                              className={`p-2.5 sm:p-3 bg-white border rounded-2xl transition-all shadow-xs flex flex-col justify-between ${
                                isSelected 
                                  ? 'border-blue-500 bg-blue-50/20 ring-1 ring-blue-500/20 shadow-sm' 
                                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm'
                              }`}
                            >
                              <div className="flex flex-col">
                                {/* Centered Thumbnail */}
                                <div className="relative flex justify-center items-center py-1 mb-1.5 bg-slate-50/80 rounded-xl overflow-hidden">
                                  <ProductThumbnail product={p} size="sm" className="w-14 h-14 sm:w-16 sm:h-16 object-contain" />
                                  {isSelected && (
                                    <span className="absolute top-1 right-1 text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded shadow-xs">
                                      已選 {existingItem.quantity}
                                    </span>
                                  )}
                                </div>

                                {/* Title with 2-line clamp */}
                                <h5 className="font-black text-xs sm:text-sm text-slate-900 leading-snug line-clamp-2 min-h-[2.4rem] break-words" title={p.name}>
                                  {p.name}
                                </h5>

                                {/* Price and Stock */}
                                <div className="flex items-baseline justify-between mt-1 gap-1">
                                  <span className="text-xs sm:text-sm font-black text-blue-700 tabular-nums">
                                    ${price.toFixed(2)}
                                  </span>
                                  <span className={`text-[10px] sm:text-[11px] font-bold truncate ${
                                    p.unlimitedStock 
                                      ? 'text-slate-400' 
                                      : rem <= 0 
                                        ? 'text-rose-600 font-black' 
                                        : rem < 10 
                                          ? 'text-amber-600' 
                                          : 'text-slate-500'
                                  }`}>
                                    {p.unlimitedStock ? '無限制' : `剩餘: ${rem}`}
                                  </span>
                                </div>

                                {/* Category label if available */}
                                {getProductCategoryString(p) && (
                                  <div className="text-[9px] text-slate-400 truncate mt-0.5" title={getProductCategoryString(p)}>
                                    {getProductCategoryString(p).split('\n')[0]}
                                  </div>
                                )}
                              </div>

                              {/* Action buttons on card */}
                              <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col justify-end">
                                {!existingItem ? (
                                  <button
                                    type="button"
                                    onClick={() => handleAddProduct(p)}
                                    className="w-full py-1.5 sm:py-2 px-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1 shadow-xs transition-all"
                                  >
                                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                    <span>加入訂單</span>
                                  </button>
                                ) : (
                                  <div className="w-full flex flex-col gap-1.5">
                                    <div className="flex items-center justify-between gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleReduceProduct(p)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 flex items-center justify-center font-black transition-colors shrink-0"
                                      >
                                        <Minus className="w-3.5 h-3.5 stroke-[3]" />
                                      </button>

                                      <input
                                        type="number"
                                        value={existingItem.quantity}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value) || 0;
                                          handleUpdateItem(existingItem.id, { quantity: val });
                                        }}
                                        className="w-full min-w-0 h-7 sm:h-8 text-center text-xs sm:text-sm font-black bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                                      />

                                      <button
                                        type="button"
                                        onClick={() => handleAddProduct(p)}
                                        className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white flex items-center justify-center font-black shadow-xs transition-colors shrink-0"
                                      >
                                        <Plus className="w-3.5 h-3.5 stroke-[3]" />
                                      </button>
                                    </div>

                                    <div className="flex items-center justify-between gap-1">
                                      {existingItem.unitsPerBox && existingItem.unitsPerBox > 1 ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const boxQty = Number(existingItem.unitsPerBox) || 1;
                                            if (existingItem.isOuterBox) {
                                              handleUpdateItem(existingItem.id, { isOuterBox: false, quantity: 1 });
                                            } else {
                                              handleUpdateItem(existingItem.id, { isOuterBox: true, quantity: boxQty });
                                            }
                                          }}
                                          className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-black border transition-all text-center truncate ${
                                            existingItem.isOuterBox
                                              ? 'bg-blue-600 text-white border-blue-600'
                                              : 'bg-slate-100 text-slate-600 border-slate-200'
                                          }`}
                                        >
                                          {existingItem.isOuterBox ? `${existingItem.outerBoxUnit || '箱'}` : '散裝'}
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-blue-600 font-bold px-0.5 truncate">已選購</span>
                                      )}

                                      <button
                                        type="button"
                                        onClick={() => handleRemoveItem(existingItem.id)}
                                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors shrink-0"
                                        title="刪除"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Bottom Sticky Action Bar inside Category Page */}
                    <div className="sticky bottom-0 -mx-2 sm:-mx-4 px-3 sm:px-6 py-3 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg z-20">
                      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] sm:text-xs font-bold text-slate-500">
                            已選 <strong className="text-blue-700 font-black text-sm sm:text-base">{selectedItems.length}</strong> 項貨品
                          </div>
                          <div className="text-sm sm:text-base font-black text-slate-900">
                            總金額: ${totalOrderAmount.toLocaleString()}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => { setSelectedCategory(null); setCategorySearchQuery(''); }}
                          className="px-4 sm:px-6 py-2 sm:py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl font-black text-xs sm:text-sm shadow-md shadow-green-600/20 active:scale-95 transition-all flex items-center gap-1.5"
                        >
                          <span>完成並返回訂單</span>
                          <ArrowRight className="w-4 h-4 stroke-[3]" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : activeTab === 'order' ? (
                <motion.div
                  key="order-tab"
                  initial={{ x: 0, opacity: 1 }}
                  exit={{ x: -20, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute inset-0 overflow-y-auto px-2 sm:px-4 pt-3 pb-24 custom-scrollbar"
                >
                  <div className="max-w-md mx-auto">
                    <div className="space-y-3 sm:space-y-4">
                      <div className="flex flex-col px-1">
                        {/* TOP SECTION: Customer Info & Remarks on Left, 8 Category Buttons on Right (Red Box Space) */}
                        <div className="flex items-start justify-between gap-2 sm:gap-2.5 mb-2.5">
                          {/* Left Column: Customer, Remark, 2-line Checkboxes */}
                          <div className="flex-1 min-w-0 flex flex-col gap-2">
                            {/* Customer Name, Grade, and Item count badge */}
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                              <h4 className="text-base sm:text-xl font-black text-slate-900 tracking-tight truncate">
                                {selectedCustomer}
                              </h4>
                              <span className="text-[11px] sm:text-xs font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full flex-shrink-0">
                                Grade {selectedCustomerInfo?.grade}
                              </span>
                              <span className="flex items-center justify-center min-w-[20px] h-5 sm:h-6 bg-slate-200 text-slate-700 text-[11px] sm:text-xs font-black rounded-full px-1.5 flex-shrink-0">
                                {selectedItems.length}
                              </span>
                            </div>

                            {/* Remark Button & Refresh Button */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <button 
                                type="button"
                                onClick={() => setShowRemarkInput(!showRemarkInput)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black transition-all border shadow-sm ${
                                  remark 
                                    ? 'bg-blue-700 text-white border-blue-700 shadow-blue-700/20' 
                                    : 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700 shadow-blue-600/20'
                                }`}
                              >
                                <Check className={`w-3.5 h-3.5 stroke-[3] ${remark ? 'block' : 'hidden'}`} />
                                {remark ? '已添加備註' : '+ 備註'}
                              </button>
                              {remark && (
                                <button 
                                  type="button"
                                  onClick={() => setRemark('')} 
                                  className="text-[11px] font-black text-red-500 uppercase tracking-widest hover:text-red-700 transition-colors"
                                >
                                  Clear
                                </button>
                              )}
                              <button 
                                type="button"
                                onClick={handleRefreshLiveInfo}
                                disabled={isRefreshingLive}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-black transition-all border shadow-sm ${
                                  isRefreshingLive 
                                    ? 'bg-slate-100 text-slate-400 border-slate-300 cursor-not-allowed' 
                                    : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:border-emerald-700 shadow-emerald-600/20 active:scale-95'
                                }`}
                                title="從 Google Sheet 重新抓取最新貨品價格與庫存"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 stroke-[2.5] ${isRefreshingLive ? 'animate-spin' : ''}`} />
                                <span>{isRefreshingLive ? '更新中...' : '更新'}</span>
                              </button>
                              {refreshMessage && (
                                <span className="text-[11px] font-bold text-emerald-600 animate-fade-in whitespace-nowrap">
                                  {refreshMessage}
                                </span>
                              )}
                            </div>

                            {/* Checkboxes: 2 rows! Row 1: 收及單 & 明天送; Row 2: COD & 原板落, 不搬 */}
                            <div className="flex flex-col gap-1.5 bg-slate-50 border border-slate-200 px-2.5 sm:px-3 py-2 rounded-xl text-xs sm:text-sm font-bold text-slate-700 max-w-full">
                              {/* Row 1: 收及單 & 明天送 */}
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 transition-colors select-none">
                                  <input
                                    type="checkbox"
                                    checked={remark.includes('收及單')}
                                    onChange={(e) => toggleRemarkKeyword('收及單', e.target.checked)}
                                    className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer"
                                  />
                                  <span className="whitespace-nowrap">收及單</span>
                                </label>
                                <div className="h-3 w-px bg-slate-200 mx-0.5" />
                                <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 transition-colors select-none">
                                  <input
                                    type="checkbox"
                                    checked={remark.includes('明天送')}
                                    onChange={(e) => toggleRemarkKeyword('明天送', e.target.checked)}
                                    className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer"
                                  />
                                  <span className="whitespace-nowrap">明天送</span>
                                </label>
                              </div>

                              {/* Row 2: COD & 原板落, 不搬 (under 收及單 & 明天送) */}
                              <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60">
                                <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 transition-colors select-none">
                                  <input
                                    type="checkbox"
                                    checked={remark.includes('COD')}
                                    onChange={(e) => toggleRemarkKeyword('COD', e.target.checked)}
                                    className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer"
                                  />
                                  <span className="whitespace-nowrap">COD</span>
                                </label>
                                <div className="h-3 w-px bg-slate-200 mx-0.5" />
                                <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 transition-colors select-none">
                                  <input
                                    type="checkbox"
                                    checked={remark.includes('原板落, 不搬')}
                                    onChange={(e) => toggleRemarkKeyword('原板落, 不搬', e.target.checked)}
                                    className="w-3.5 h-3.5 text-blue-600 border-slate-300 rounded focus:ring-blue-500/20 cursor-pointer"
                                  />
                                  <span className="whitespace-nowrap">原板落, 不搬</span>
                                </label>
                              </div>
                            </div>
                          </div>

                          {/* Right Column: 8 Category Buttons in the Red Box Space */}
                          <div className="w-[160px] sm:w-[190px] shrink-0 flex flex-col justify-start">
                            <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
                              {CATEGORY_BUTTONS.map((btn) => (
                                <button
                                  key={btn}
                                  type="button"
                                  onClick={() => { setSelectedCategory(btn); setCategorySearchQuery(''); }}
                                  className="h-8 flex items-center justify-center px-1 py-1 bg-blue-50/90 hover:bg-blue-600 active:scale-95 text-blue-700 hover:text-white border border-blue-200/90 rounded-lg text-[11px] sm:text-xs font-black transition-all shadow-xs text-center truncate group"
                                  title={`選擇 ${btn} 貨品`}
                                >
                                  <span className="truncate">{btn}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Order Summary banner & 此單完成 button */}
                        {selectedItems.length > 0 && (
                          <div className="flex items-center justify-between bg-blue-50/80 border border-blue-200/80 rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 mb-2 shadow-xs">
                            <div className="flex items-center gap-2 text-slate-700 font-bold text-xs sm:text-base">
                              <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                              <span>已選 <strong className="text-blue-700 font-black text-sm sm:text-lg">{selectedItems.length}</strong> 項</span>
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3">
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] sm:text-sm font-bold text-slate-500">總金額:</span>
                                <span className="text-base sm:text-xl font-black text-blue-700 tabular-nums">
                                  ${totalOrderAmount.toLocaleString()}
                                </span>
                              </div>
                              <button 
                                onClick={handleFinalSave}
                                className="bg-green-600 hover:bg-green-700 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl shadow-md shadow-green-600/20 active:scale-95 transition-all group shrink-0 text-xs sm:text-base font-black flex items-center gap-1"
                                title="此單完成"
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                                <span>此單完成</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {showRemarkInput && (
                        <motion.div 
                           initial={{ height: 0, opacity: 0 }}
                           animate={{ height: 'auto', opacity: 1 }}
                           className="px-1 mt-2 mb-4 overflow-hidden"
                         >
                           <textarea
                             placeholder="輸入備註 (銷售員姓名、特殊送貨要求等)..."
                             value={remark}
                             onChange={(e) => setRemark(e.target.value)}
                             className="w-full bg-blue-50/50 border border-blue-100 rounded-xl px-4 py-3 text-base sm:text-lg font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[75px]"
                           />
                         </motion.div>
                       )}
 
                       {selectedItems.length === 0 ? (
                         <div className="p-16 border-2 border-dashed border-slate-100 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-300 gap-3 mt-4 text-center">
                           <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center text-slate-300">
                             <Package className="w-8 h-8 opacity-30" />
                           </div>
                           <p className="text-base font-black uppercase tracking-wider text-slate-400">尚未選取任何貨品</p>
                           <p className="text-sm font-bold text-slate-400">請在上方搜尋欄輸入貨品名稱，或在常用貨品中選取</p>
                         </div>
                       ) : (
                         <div className="space-y-3.5">
                          {selectedItems.map((item) => {
                            const prod = products.find(p => p.name === item.name);
                            const isUnlimited = !prod || !!prod.unlimitedStock;
                            const rem = prod ? getRemainingStock(prod) : Infinity;
                            const maxStockForThisOrder = getMaxStockForOrder(item.name);

                            return (
                              <div key={item.id} className="bg-white border border-slate-200 rounded-xl p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all group">
                                <div className="flex items-center justify-between gap-2 mb-3">
                                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (prod) toggleFavorite(prod);
                                      }}
                                      className={`p-1 rounded-md transition-colors flex-shrink-0 ${
                                        isFavorite(item.name) ? 'text-yellow-400' : 'text-slate-300 hover:text-yellow-300'
                                      }`}
                                    >
                                      <Star className={`w-5 h-5 ${isFavorite(item.name) ? 'fill-current' : ''}`} />
                                    </button>
                                    <div className="flex flex-col min-w-0">
                                      <h5 className="text-base sm:text-lg md:text-xl font-black text-slate-900 leading-snug break-words">{item.name}</h5>
                                      <div className="flex items-center gap-2.5 mt-1.5">
                                        {prod && <ProductThumbnail product={prod} size="sm" />}
                                        {!isUnlimited && (
                                          <span className={`text-xs sm:text-sm font-bold ${rem < 0 ? 'text-rose-600' : rem === 0 ? 'text-rose-600' : rem < 10 ? 'text-amber-600' : 'text-slate-500'}`}>
                                            {rem < 0 ? `剩餘可用庫存: ${rem} (負庫存)` : rem === 0 ? '剩餘可用庫存: 0' : `剩餘可用庫存: ${rem}`}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {item.unitsPerBox && (
                                      <div className="flex p-0.5 bg-slate-100 rounded-lg flex-shrink-0">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleUpdateItem(item.id, { isOuterBox: false, quantity: 1 });
                                          }}
                                          className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:text-sm font-black transition-all ${
                                            !item.isOuterBox 
                                              ? 'bg-white text-blue-600 shadow-sm' 
                                              : 'text-slate-500 hover:text-slate-700'
                                          }`}
                                        >
                                          單位
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const boxQty = item.unitsPerBox || 12;
                                            handleUpdateItem(item.id, { isOuterBox: true, quantity: boxQty });
                                          }}
                                          className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:text-sm font-black transition-all ${
                                            item.isOuterBox 
                                              ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20' 
                                              : 'text-slate-500 hover:text-slate-700'
                                          }`}
                                        >
                                          {item.outerBoxUnit || '箱'}
                                        </button>
                                      </div>
                                    )}
                                    <button 
                                      type="button"
                                      onClick={() => handleRemoveItem(item.id)}
                                      className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex-shrink-0"
                                      title="刪除此貨品"
                                    >
                                      <Trash2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-1.5 sm:gap-2 pt-2 border-t border-slate-100 flex-wrap sm:flex-nowrap">
                                  {/* Quantity Stepper */}
                                  <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 overflow-hidden w-28 sm:w-32 flex-shrink-0">
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        const step = (item.isOuterBox && item.outerBoxUnit !== "打") ? (Number(item.unitsPerBox) || 1) : 1;
                                        const curQty = Number(item.quantity) || 0;
                                        handleUpdateItem(item.id, { quantity: curQty - step });
                                      }}
                                      className="p-1.5 sm:p-2.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                                      title="減少數量"
                                    >
                                      <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                                    </button>
                                    <input
                                      type="number"
                                      value={item.quantity}
                                      min="0"
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        handleUpdateItem(item.id, { quantity: val });
                                      }}
                                      className="w-full text-center bg-transparent text-base sm:text-xl font-black text-slate-900 focus:outline-none tabular-nums min-w-0"
                                    />
                                    <button 
                                      type="button"
                                      onClick={() => {
                                        const step = (item.isOuterBox && item.outerBoxUnit !== "打") ? (Number(item.unitsPerBox) || 1) : 1;
                                        const curQty = Number(item.quantity) || 0;
                                        handleUpdateItem(item.id, { quantity: curQty + step });
                                      }}
                                      className="p-1.5 sm:p-2.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                                      title="增加數量"
                                    >
                                      <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                                    </button>
                                  </div>
                                   {/* Price Adjustment */}
                                   <div className="flex items-center justify-center flex-shrink-0">
                                     <div className="flex items-center gap-0.5 sm:gap-1">
                                       <button 
                                         type="button"
                                         onClick={() => {
                                           const rawVal = tempPrices[item.id] !== undefined ? tempPrices[item.id] : item.price;
                                           const currentPrice = typeof rawVal === 'number' ? rawVal : (parseFloat(String(rawVal).replace(/[^0-9.-]/g, '')) || 0);
                                           const newPrice = Math.round((currentPrice - 1) * 100) / 100;
                                           handleUpdateItem(item.id, { price: newPrice });
                                           setTempPrices(prev => {
                                             const copy = { ...prev };
                                             delete copy[item.id];
                                             return copy;
                                           });
                                         }}
                                         className="p-1.5 sm:p-2 text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors active:scale-95"
                                         title="減$1"
                                       >
                                         <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                                       </button>

                                       <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 px-1.5 py-1 sm:px-2 sm:py-1.5 w-18 sm:w-24 flex-shrink-0">
                                         <span className="text-slate-400 text-xs sm:text-sm font-black mr-0.5 shrink-0">$</span>
                                         <input
                                           type="text"
                                           inputMode="decimal"
                                           value={tempPrices[item.id] !== undefined ? tempPrices[item.id] : item.price}
                                           onChange={(e) => {
                                             const val = e.target.value;
                                             setTempPrices(prev => ({ ...prev, [item.id]: val }));
                                             const parsed = parseFloat(val);
                                             if (!isNaN(parsed)) {
                                               handleUpdateItem(item.id, { price: parsed });
                                             }
                                           }}
                                           onBlur={() => {
                                             if (tempPrices[item.id] !== undefined) {
                                               const parsed = parseFloat(tempPrices[item.id]);
                                               if (!isNaN(parsed)) {
                                                 handleUpdateItem(item.id, { price: parsed });
                                               }
                                             }
                                             setTempPrices(prev => {
                                               const copy = { ...prev };
                                               delete copy[item.id];
                                               return copy;
                                             });
                                           }}
                                           className="w-full text-center bg-transparent text-sm sm:text-base md:text-lg font-black text-slate-900 focus:outline-none tabular-nums min-w-0"
                                         />
                                       </div>

                                       <button 
                                         type="button"
                                         onClick={() => {
                                           const rawVal = tempPrices[item.id] !== undefined ? tempPrices[item.id] : item.price;
                                           const currentPrice = typeof rawVal === 'number' ? rawVal : (parseFloat(String(rawVal).replace(/[^0-9.-]/g, '')) || 0);
                                           const newPrice = Math.round((currentPrice + 1) * 100) / 100;
                                           handleUpdateItem(item.id, { price: newPrice });
                                           setTempPrices(prev => {
                                             const copy = { ...prev };
                                             delete copy[item.id];
                                             return copy;
                                           });
                                         }}
                                         className="p-1.5 sm:p-2 text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 transition-colors active:scale-95"
                                         title="加$1"
                                       >
                                         <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[3]" />
                                       </button>
                                     </div>
                                   </div>

                                   {/* Subtotal & Delete */}
                                   <div className="flex items-center justify-end gap-1.5 sm:gap-2 flex-shrink-0 ml-auto">
                                     <span className="text-sm sm:text-base md:text-xl font-black text-blue-600 block tabular-nums leading-none text-right">
                                       ${(item.quantity * item.price).toLocaleString()}
                                     </span>
                                     <button 
                                       type="button"
                                       onClick={() => handleRemoveItem(item.id)}
                                       className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all flex-shrink-0"
                                       title="刪除"
                                     >
                                       <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                     </button>
                                   </div>
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="favorites-tab"
                  initial={{ x: 20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 20, opacity: 0 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                  className="absolute inset-0 overflow-y-auto px-2 sm:px-4 pt-3 pb-24 custom-scrollbar"
                >
                  <div className="max-w-md mx-auto">
                    <h4 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-widest mb-4 px-1 text-center">
                       常用貨品 (Favorites)
                    </h4>
                     
                    {favorites.length === 0 ? (
                       <div className="p-16 border-2 border-dashed border-slate-100 rounded-[2.5rem] flex flex-col items-center justify-center text-slate-300 gap-3 mt-4 text-center">
                         <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                           <Star className="w-8 h-8 opacity-30" />
                         </div>
                         <p className="text-base font-black uppercase tracking-wider text-slate-400">尚無常用貨品</p>
                         <p className="text-sm font-bold text-slate-400 leading-relaxed max-w-[220px]">在搜尋時點擊星星圖示即可將產品加入常用貨品</p>
                       </div>
                    ) : (
                       <div className="grid grid-cols-1 gap-3">
                         {favorites.map((p, idx) => {
                          const rem = getRemainingStock(p);
                          const price = getProductPrice(p);
                          return (
                            <div
                              key={idx}
                              className="w-full flex items-center justify-between p-3.5 sm:p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-500/30 transition-all group"
                            >
                              <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                                <button
                                  type="button"
                                  onClick={() => toggleFavorite(p)}
                                  className="p-1.5 rounded-md text-yellow-400 transition-colors"
                                >
                                  <Star className="w-5 h-5 fill-current" />
                                </button>
                                <div className="flex flex-col min-w-0 align-left text-left">
                                  <span className="text-base sm:text-lg font-black leading-snug break-words text-slate-900">{p.name}</span>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    <ProductThumbnail product={p} size="sm" />
                                    <span className="text-sm sm:text-base font-black text-blue-700 tabular-nums">
                                      ${price.toFixed(2)}
                                    </span>
                                    <span className="text-slate-300">•</span>
                                    {p.unlimitedStock ? (
                                      <span className="text-xs sm:text-sm font-bold text-slate-400">庫存: 無限制</span>
                                    ) : (
                                      <span className={`text-xs sm:text-sm font-bold ${
                                        rem < 0 ? 'text-rose-600' : rem === 0 ? 'text-rose-600' : rem < 10 ? 'text-amber-600' : 'text-slate-500'
                                      }`}>
                                        {rem < 0 ? `剩餘庫存: ${rem} (負庫存)` : rem === 0 ? '剩餘庫存: 0' : (rem < 10) ? `剩餘庫存: ${rem} (庫存緊張)` : `剩餘庫存: ${rem}`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  handleAddProduct(p);
                                  setActiveTab('order');
                                }}
                                className="p-2.5 rounded-xl active:scale-95 transition-all flex-shrink-0 text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20"
                                title="加入訂單"
                              >
                                <Plus className="w-5 h-5 stroke-[3]" />
                              </button>
                            </div>
                          );
                        })}
                       </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Floating Bottom Tab Switcher (Slide Bar) */}
          <div className="fixed bottom-4 right-4 sm:left-1/2 sm:-translate-x-1/2 z-30 flex justify-center pointer-events-none">
            <div className="w-full max-w-[280px] sm:max-w-[320px] bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-300/50 p-1 flex items-center relative pointer-events-auto">
              {/* Sliding highlight background */}
              <div className="absolute inset-y-1 left-1 bottom-1 top-1 pointer-events-none" style={{ width: 'calc(50% - 4px)' }}>
                <motion.div
                  layoutId="bottom-tab-highlight"
                  className="h-full bg-blue-600 rounded-xl shadow-md shadow-blue-600/10"
                  animate={{
                    translateX: activeTab === 'order' ? '0%' : '100%',
                  }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              </div>

              {/* Order Button */}
              <button
                type="button"
                onClick={() => setActiveTab('order')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm sm:text-base font-black tracking-wider relative z-10 transition-colors duration-300 ${
                  activeTab === 'order' ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                訂單 ({selectedItems.length})
              </button>

              {/* Favorites Button */}
              <button
                type="button"
                onClick={() => setActiveTab('favorites')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm sm:text-base font-black tracking-wider relative z-10 transition-colors duration-300 ${
                  activeTab === 'favorites' ? 'text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Star className="w-4 h-4 sm:w-5 sm:h-5" />
                常用
              </button>
            </div>
          </div>
        </div>
        {renderFloatingBackButton()}
        {renderModals()}
      </div>
    );
  }

  if (selectedRole) {
    return (
      <div className="h-[100dvh] max-h-[100dvh] w-full bg-white p-2 sm:p-6 animate-in fade-in duration-300 flex flex-col overflow-hidden">
        <div className="w-full max-w-md mx-auto pt-2 sm:pt-4 flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between mb-3 sm:mb-4 flex-shrink-0">
            <button 
              type="button"
              onClick={() => setSelectedRole(null)}
              className="flex items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="text-xs font-black uppercase tracking-widest">Back to Roles</span>
            </button>
            <div className="bg-slate-100 px-3 py-1 rounded-full text-[10px] font-black text-slate-500 uppercase tracking-widest">
              ROLE: {selectedRole}
            </div>
          </div>

          <div className="relative mb-3 sm:mb-4 flex items-center gap-2 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="搜尋客戶名稱..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 sm:py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-bold text-base focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-inner"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setNewCustomerDistrict(selectedDistrict || '九龍東');
                setNewCustomerGrade('C');
                setNewCustomerName('');
                setShowAddCustomerModal(true);
              }}
              className="p-3 sm:p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm flex-shrink-0"
              title="Add New Customer"
            >
              <UserPlus className="w-5 h-5" />
            </button>
            {onShowOrderList && (
              <button 
                type="button"
                onClick={onShowOrderList}
                className="p-3 sm:p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm flex-shrink-0"
                title="Order List"
              >
                <ListOrdered className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="flex gap-1 mb-3 overflow-x-auto pb-2 custom-scrollbar no-scrollbar scroll-smooth flex-shrink-0">
            {districts.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelectedDistrict(selectedDistrict === d ? null : d)}
                className={`py-2 px-2 rounded-xl text-[9px] font-black transition-all whitespace-nowrap min-w-[70px] border ${
                  selectedDistrict === d 
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20 scale-[0.98]' 
                    : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'
                }`}
              >
                {d} ({districtCounts[d] || 0})
              </button>
            ))}
          </div>
          
          <div 
            onScroll={() => {
              if (document.activeElement instanceof HTMLInputElement) {
                document.activeElement.blur();
              }
            }}
            className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar pb-24"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {filteredCustomers.length === 0 ? (
              <div className="p-12 border-2 border-dashed border-slate-100 rounded-3xl text-center">
                <ShoppingCart className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">沒有找到匹配的客戶</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredCustomers.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedCustomer(c.name)}
                    className="w-full flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:border-blue-500/30 hover:bg-slate-50/50 transition-all duration-200 group active:scale-[0.98] text-left select-none"
                  >
                    <div className="overflow-hidden">
                      <p className="text-slate-900 font-bold text-[11px] leading-tight truncate">{c.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[8px] font-black uppercase tracking-widest px-1 rounded ${
                          c.grade === 'A' ? 'bg-yellow-100 text-yellow-700' :
                          c.grade === 'B' ? 'bg-slate-100 text-slate-600' :
                          'bg-orange-100 text-orange-700'
                        }`}>Grade {c.grade}</span>
                        {(selectedRole === 'Admin' || searchQuery.trim()) && (c.sales || (c as any).user) && (
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">Sales: {c.sales || (c as any).user}{c.district ? ` (${c.district})` : ''}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {renderFloatingBackButton()}
        {renderModals()}
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/20 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-indigo-600/20 blur-[100px] rounded-full" />
      
      <div className="relative z-10 w-full max-w-sm px-2 sm:px-0">
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl mx-auto flex items-center justify-center shadow-2xl shadow-blue-600/40 mb-6 rotate-3">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-3xl font-black text-white tracking-tighter mb-2">WHATS-ORDER</h2>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em]">Authentication Required</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {salesPeople.map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className="group relative bg-white/5 hover:bg-blue-600 border border-white/5 hover:border-blue-500 p-6 rounded-3xl transition-all duration-300 flex flex-col items-center gap-3 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <User className="w-6 h-6 text-slate-400 group-hover:text-white transition-colors relative z-10" />
                <span className="text-xs font-black text-slate-300 group-hover:text-white transition-colors relative z-10 uppercase tracking-widest">{role}</span>
              </button>
            ))}
            <button
              onClick={() => setSelectedRole('Admin')}
              className="col-span-2 group relative bg-slate-800/50 hover:bg-slate-700 border border-white/5 p-6 rounded-3xl transition-all duration-300 flex items-center justify-center gap-3 overflow-hidden mt-2"
            >
              <ShieldCheck className="w-5 h-5 text-slate-500 group-hover:text-white" />
              <span className="text-xs font-black text-slate-400 group-hover:text-white uppercase tracking-widest">Admin Access</span>
            </button>
          </div>
        </div>
      </div>
      {renderFloatingBackButton()}
    </div>
  );
};

export default OrderEntry;
