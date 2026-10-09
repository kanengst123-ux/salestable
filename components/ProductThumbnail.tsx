import React, { useState } from 'react';
import { Product } from '../types';
import {
  formatProductId,
  PRODUCT_IMAGE_DEV_BASE_URL,
  PRODUCT_IMAGE_PRE_BASE_URL,
  PRODUCT_IMAGE_SERVICE_BASE_URL,
} from '../services/dataService';
import { ImageIcon, X } from 'lucide-react';

interface ProductThumbnailProps {
  product: Product;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  allowZoom?: boolean;
}

export const ProductThumbnail: React.FC<ProductThumbnailProps> = ({
  product,
  size = 'sm',
  className = '',
  allowZoom = true,
}) => {
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  const rawId = (product.id || '').trim();
  const formattedId = formatProductId(rawId);
  const directUrl = (product.rawImageUrl || (product.imageUrl && !product.imageUrl.includes('/api/products/') && !product.imageUrl.includes('/api/product-image') ? product.imageUrl : '')).trim();

  // Reset error and attempt state whenever product or image properties change
  React.useEffect(() => {
    setAttemptIndex(0);
    setHasError(false);
  }, [product.id, product.imageUrl, product.rawImageUrl]);

  // List of candidate image URLs in priority order:
  // 1. Primary Dev Authority Endpoint: https://ais-dev-e67qvrm3vxclidkmxocymu-259187692597.us-east1.run.app/api/products/{productId}/image
  // 2. Shared URL Fallback: https://ais-pre-e67qvrm3vxclidkmxocymu-259187692597.us-east1.run.app/api/products/{productId}/image
  // 3. Local proxy endpoint: /api/products/{productId}/image
  // 4. Direct / Sheet15 image URL (with proxy fallback)
  const candidateUrls = React.useMemo(() => {
    const urls: string[] = [];

    if (formattedId) {
      urls.push(`${PRODUCT_IMAGE_DEV_BASE_URL}/api/products/${encodeURIComponent(formattedId)}/image`);
      if (rawId && rawId !== formattedId) {
        urls.push(`${PRODUCT_IMAGE_DEV_BASE_URL}/api/products/${encodeURIComponent(rawId)}/image`);
      }
      urls.push(`${PRODUCT_IMAGE_PRE_BASE_URL}/api/products/${encodeURIComponent(formattedId)}/image`);
      urls.push(`/api/products/${encodeURIComponent(formattedId)}/image`);
    }

    if (directUrl && directUrl.startsWith('http')) {
      urls.push(directUrl);
      urls.push(`/api/proxy-image?url=${encodeURIComponent(directUrl)}`);
    }

    if (formattedId) {
      urls.push(`/api/product-image/${encodeURIComponent(formattedId)}`);
    }

    return urls;
  }, [formattedId, rawId, directUrl]);

  const currentSrc = !hasError && candidateUrls.length > 0 && attemptIndex < candidateUrls.length
    ? candidateUrls[attemptIndex]
    : '';

  // Size styling
  const sizeClasses = {
    sm: 'w-12 h-12 min-w-[48px] min-h-[48px]',
    md: 'w-16 h-16 min-w-[64px] min-h-[64px]',
    lg: 'w-20 h-20 min-w-[80px] min-h-[80px]',
  }[size];

  if (!currentSrc || hasError) {
    return (
      <div
        className={`${sizeClasses} rounded-lg bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-300 flex-shrink-0 ${className}`}
        title={formattedId ? `暫無圖片 (貨品 ID: ${formattedId})` : "暫無圖片"}
      >
        <ImageIcon className="w-5 h-5 opacity-60" />
      </div>
    );
  }

  return (
    <>
      <div
        onClick={(e) => {
          if (allowZoom) {
            e.stopPropagation();
            setIsZoomed(true);
          }
        }}
        className={`relative ${sizeClasses} rounded-lg bg-white border border-slate-200/90 p-0.5 shadow-xs overflow-hidden flex-shrink-0 flex items-center justify-center group/thumb ${
          allowZoom ? 'cursor-zoom-in hover:border-blue-400' : ''
        } ${className}`}
        title={allowZoom ? `點擊放大查看貨品圖片 (ID: ${formattedId})` : product.name}
      >
        <img
          src={currentSrc}
          alt={product.name}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="w-full h-full object-contain rounded transition-transform group-hover/thumb:scale-105"
          onError={() => {
            if (attemptIndex + 1 < candidateUrls.length) {
              setAttemptIndex(prev => prev + 1);
            } else {
              setHasError(true);
            }
          }}
        />
      </div>

      {/* Lightbox zoom modal */}
      {isZoomed && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={(e) => {
            e.stopPropagation();
            setIsZoomed(false);
          }}
        >
          <div
            className="relative max-w-sm sm:max-w-md w-full bg-white rounded-2xl p-4 shadow-2xl flex flex-col items-center gap-3 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute top-3 right-3 p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h4 className="text-base sm:text-lg font-black text-slate-900 pr-8 leading-snug">{product.name}</h4>
            <div className="w-full max-h-[60vh] flex items-center justify-center p-2 bg-slate-50 rounded-xl overflow-hidden">
              <img
                src={currentSrc}
                alt={product.name}
                referrerPolicy="no-referrer"
                className="max-h-[55vh] w-auto max-w-full object-contain"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="mt-1 px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors"
            >
              關閉預覽
            </button>
          </div>
        </div>
      )}
    </>
  );
};
