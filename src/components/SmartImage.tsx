import { useEffect, useRef, useState, type CSSProperties, type MouseEventHandler } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';

interface SmartImageProps {
  src: string;
  alt: string;
  className?: string;
  wrapperClassName?: string;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
  decoding?: 'async' | 'sync' | 'auto';
  fetchPriority?: 'high' | 'low' | 'auto';
  width?: number;
  height?: number;
  title?: string;
  variant?: 'card' | 'compact' | 'banner' | 'lightbox';
  showRetryOnError?: boolean;
  onClick?: MouseEventHandler<HTMLImageElement>;
}

export function SmartImage({
  src,
  alt,
  className = '',
  wrapperClassName = '',
  style,
  loading = 'lazy',
  decoding = 'async',
  fetchPriority,
  width,
  height,
  title,
  variant = 'card',
  showRetryOnError = false,
  onClick,
}: SmartImageProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retryCount, setRetryCount] = useState(0);

  // Reset when src changes; immediately mark loaded if already cached/decoded
  useEffect(() => {
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      setStatus('loaded');
    } else {
      setStatus('loading');
    }
    setRetryCount(0);
  }, [src]);

  // One silent automatic retry after a brief pause on slow/flaky networks
  useEffect(() => {
    if (status !== 'error' || retryCount >= 1) return;
    const timer = window.setTimeout(() => {
      setRetryCount((n) => n + 1);
      setStatus('loading');
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [status, retryCount]);

  const effectiveSrc =
    retryCount > 0 && src
      ? `${src}${src.includes('?') ? '&' : '?'}r=${retryCount}`
      : src;

  const handleManualRetry = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setRetryCount((n) => n + 1);
    setStatus('loading');
  };

  return (
    <span className={`smart-img-wrap smart-img-wrap--${variant}${wrapperClassName ? ` ${wrapperClassName}` : ''}`}>
      {status === 'loading' && (
        <span className="smart-img-loader" aria-hidden="true">
          <span className="smart-img-loader__shimmer" />
          <span className="smart-img-loader__center">
            <span className="smart-img-spinner" />
            {variant !== 'compact' && variant !== 'banner' && (
              <span className="smart-img-brand">YS</span>
            )}
          </span>
        </span>
      )}

      {status === 'error' && retryCount >= 1 && (
        <span className="smart-img-fallback">
          <ImageOff size={variant === 'compact' ? 14 : 20} />
          {variant !== 'compact' && <small>Foto no disponible</small>}
          {showRetryOnError && (
            <button
              type="button"
              className="smart-img-retry"
              onClick={handleManualRetry}
              aria-label={`Reintentar cargar ${alt}`}
            >
              <RefreshCw size={12} />
              <span>Reintentar</span>
            </button>
          )}
        </span>
      )}

      <img
        ref={imgRef}
        src={effectiveSrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        fetchPriority={fetchPriority}
        width={width}
        height={height}
        title={title}
        style={style}
        onClick={onClick}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={`smart-img is-${status}${className ? ` ${className}` : ''}`}
      />
    </span>
  );
}
