
export interface SaleRecord extends Record<string, any> {
  orderId: string;
  orderDate: string;
  customerName: string;
  userName: string;
  segment: string;
  region: string;
  category: string;
  subCategory: string;
  productName: string;
  sales: number;
  quantity: number;
  profit: number;
  // Specific fields for collections and specialized tracking
  subtotal: number;
  paidStatus: string;
  paidDate: string;
  colSValue: string;
  countValue: number; // Derived from Column R
  unit: string;
  price: number;
}

export interface SalesData {
  records: SaleRecord[];
  headers: string[];
}

export interface SalesAnalytics {
  totalSales: number;
  totalProfit: number;
  totalOrders: number;
  averageOrderValue: number;
  salesByCategory: Record<string, number>;
  salesByRegion: Record<string, number>;
  salesByMonth: Record<string, number>;
  salesByDay: Record<string, number>;
  userSalesPastWeek: Record<string, number>;
  userSalesPast30Days: Record<string, number>;
}

export interface InsightReport {
  summary: string;
  keyDrivers: string[];
  recommendations: string[];
}

export type PivotField = string;
export type PivotMetric = string;
export type SortOrder = 'alpha' | 'desc' | 'asc';

export interface PivotConfig {
  rowField: PivotField;
  colField: PivotField | 'none';
  metric: PivotMetric;
  sortOrder: SortOrder;
}

export interface Product {
  id?: string;
  name: string;
  price?: number;
  prices: {
    A: number;
    B: number;
    C: number;
  };
  unlimitedStock?: boolean;
  stock?: number;
  list?: string | number;
  imageUrl?: string;
  rawImageUrl?: string;
  category?: string;
  categories?: string;
  allValues?: string[];
  extraAttributes?: Record<string, any>;
}

export interface Customer {
  name: string;
  grade: 'A' | 'B' | 'C';
  district?: string;
  sales: string;
}

export interface OrderItem {
  id: string;
  name: string;
  quantity: number; // This is the value displayed in the input
  price: number;
  isOuterBox: boolean; // Toggle state
  unitsPerBox: number | null; // Extracted from name e.g. "6/箱" -> 6
  outerBoxUnit: string | null; // Extracted from name e.g. "6/箱" -> "箱", "10/條" -> "條"
}

export interface SavedOrder {
  id: string;
  date: string;
  customerName: string;
  orderAmount: number;
  salesName: string;
  remark: string;
  items: OrderItem[];
  isHeld?: boolean;
  isKeyedIn?: boolean;
  updatedAt?: number;
  stockDeducted?: boolean;
  deductedItems?: { name: string; quantity: number }[];
}

export const APP_USERS = ['Admin', 'EVA', 'KATIE', 'KASEY', 'YO'] as const;
export type AppUser = typeof APP_USERS[number];

/**
 * Checks if the given order belongs to the specified active role / user.
 * Users: admin, eva, katie, kasey, yo
 */
export const isOrderOwner = (order: SavedOrder | null | undefined, currentRole: string | null | undefined): boolean => {
  if (!order || !currentRole) return false;
  const roleNorm = currentRole.trim().toUpperCase();
  if (!roleNorm) return false;

  const salesNorm = (order.salesName || '').trim().toUpperCase();
  if (salesNorm === roleNorm) return true;
  if (salesNorm.startsWith(roleNorm) || salesNorm.includes(roleNorm)) {
    return true;
  }

  // Fallback: Check if order.id starts with the role name (e.g. EVA00001, KATIE00002, ADMIN00003, KASEY00004, YO00005)
  const idNorm = (order.id || '').trim().toUpperCase();
  if (idNorm.startsWith(roleNorm)) return true;

  return false;
};
