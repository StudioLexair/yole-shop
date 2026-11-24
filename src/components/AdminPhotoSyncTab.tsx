import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  ScanSearch,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { Category, Currency, Department, Product } from '../types';
import { DEPARTMENT_LABELS } from '../types';
import { formatCup, resolveProductImageUrl } from '../lib/pricing';
import { optimizeImageToWebP } from '../lib/imageOptimizer';
import { saveProduct, sortSizesList, uploadProductWebP } from '../lib/catalog';
import {
  analyzeWithFreeAiVision,
  classifyAnalysisOutcome,
  computeFingerprintFromImage,
  fileToResizedBase64Jpeg,
  generateNextSku,
  indexCatalogVisualFingerprints,
  loadImageElement,
  rankCatalogMatches,
  readPhotoSyncAiConfig,
  writePhotoSyncAiConfig,
  type AiVisionProvider,
  type AnalyzedPhotoItem,
  type PhotoSyncAiConfig,
  type SyncBucket,
  type VisualFingerprint,
} from '../lib/photoSync';

interface AdminPhotoSyncTabProps {
  products: Product[];
  categories: Category[];
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

type BucketFilter = 'all' | SyncBucket;

export function AdminPhotoSyncTab({
  products,
  categories,
  onRefresh,
  onNotify,
}: AdminPhotoSyncTabProps) {
  const defaultCategoryId = categories[0]?.id || '';

  const [aiCfg, setAiCfg] = useState<PhotoSyncAiConfig>(() => readPhotoSyncAiConfig());
  const [showKey, setShowKey] = useState(false);

  const [catalogFps, setCatalogFps] = useState<Map<string, VisualFingerprint> | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [items, setItems] = useState<AnalyzedPhotoItem[]>([]);
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all');
  const [applying, setApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState<{ done: number; total: number }>({
    done: 0,
    total: 0,
  });
  const [sizeInputByItem, setSizeInputByItem] = useState<Record<string, string>>({});

  const cancelRef = useRef(false);
  const itemsRef = useRef<AnalyzedPhotoItem[]>([]);
  itemsRef.current = items;

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    };
  }, []);

  const updateAiCfg = (next: PhotoSyncAiConfig) => {
    setAiCfg(next);
    writePhotoSyncAiConfig(next);
  };

  const ensureIndex = async (): Promise<Map<string, VisualFingerprint>> => {
    if (catalogFps && catalogFps.size >= Math.min(products.length, 5)) {
      return catalogFps;
    }
    setIndexing(true);
    setIndexProgress({ done: 0, total: products.length });
    try {
      const map = await indexCatalogVisualFingerprints(
        products,
        (p) => resolveProductImageUrl(p.sku, p.image_url),
        (done, total) => setIndexProgress({ done, total })
      );
      setCatalogFps(map);
      return map;
    } finally {
      setIndexing(false);
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) {
      onNotify('Selecciona archivos de imagen (.jpg, .png, .webp).');
      return;
    }

    cancelRef.current = false;
    setAnalyzing(true);
    setAnalyzeProgress({ done: 0, total: files.length });

    try {
      const fpMap = await ensureIndex();
      const usedNewSkus = new Set<string>(
        items
          .filter((it) => it.bucket === 'new_product')
          .map((it) => it.suggestedSku)
      );
      const nextBatch: AnalyzedPhotoItem[] = [];
      const useAi = aiCfg.provider !== 'local_only' && aiCfg.apiKey.trim().length > 8;

      for (let i = 0; i < files.length; i++) {
        if (cancelRef.current) break;
        const file = files[i];
        const previewUrl = URL.createObjectURL(file);

        try {
          const imgEl = await loadImageElement(previewUrl);
          const queryFp = computeFingerprintFromImage(imgEl);
          const candidates = rankCatalogMatches(queryFp, products, fpMap, 4);
          const top = candidates[0] || null;
          const topScore = top?.score ?? 0;

          // If top match >= 0.72 pass as candidate so Vision AI verifies side-by-side and diffs sizes!
          const candidateProduct = top && topScore >= 0.72 ? top.product : null;

          let extracted = null;
          let aiErrorNote = '';
          if (useAi) {
            try {
              const b64 = await fileToResizedBase64Jpeg(file, 1024);
              const candidateUrl = candidateProduct
                ? resolveProductImageUrl(candidateProduct.sku, candidateProduct.image_url)
                : undefined;
              extracted = await analyzeWithFreeAiVision(
                aiCfg,
                b64,
                candidateProduct,
                candidateUrl
              );
              // Gentle rate pacing for free tiers
              if (i < files.length - 1) {
                await new Promise((r) => setTimeout(r, 350));
              }
            } catch (err) {
              aiErrorNote =
                err instanceof Error ? err.message : 'Error llamando a la IA gratuita';
            }
          }

          const newSku = generateNextSku(products, usedNewSkus);
          const classified = classifyAnalysisOutcome({
            matchedProduct: candidateProduct,
            matchScore: topScore,
            extracted,
            defaultCategoryId,
            suggestedSku: newSku,
            fileName: file.name,
          });
          if (classified.bucket === 'new_product') {
            usedNewSkus.add(newSku);
          }
          if (aiErrorNote) {
            classified.aiNote = `${classified.aiNote} · (${aiErrorNote})`;
          }

          nextBatch.push({
            id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
            file,
            previewUrl,
            candidates,
            ...classified,
          });
        } catch {
          const newSku = generateNextSku(products, usedNewSkus);
          usedNewSkus.add(newSku);
          nextBatch.push({
            id: `${Date.now()}-${i}`,
            file,
            previewUrl,
            matchedProduct: null,
            candidates: [],
            matchScore: 0,
            bucket: 'new_product',
            selected: true,
            replacePhoto: true,
            suggestedSku: newSku,
            title: file.name.replace(/\.[a-z0-9]+$/i, ''),
            brand: 'Importado',
            quality: '3A',
            department: 'calzado',
            categoryId: defaultCategoryId,
            price: null,
            currency: 'CUP',
            availableSizes: [],
            soldOutSizes: [],
            aiNote: 'No se pudo analizar automáticamente; revisa manualmente',
            status: 'active',
          });
        }

        setAnalyzeProgress({ done: i + 1, total: files.length });
      }

      setItems((prev) => [...nextBatch, ...prev]);
      onNotify(`${nextBatch.length} fotos analizadas. Revisa el semáforo y aplica con 1 clic.`);
    } finally {
      setAnalyzing(false);
    }
  };

  const patchItem = (id: string, patch: Partial<AnalyzedPhotoItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const toggleSizeChip = (item: AnalyzedPhotoItem, size: string) => {
    const isSoldOut = item.soldOutSizes.includes(size);
    const nextAvail = isSoldOut
      ? sortSizesList([...item.availableSizes, size])
      : item.availableSizes.filter((s) => s !== size);
    const nextSold = isSoldOut
      ? item.soldOutSizes.filter((s) => s !== size)
      : sortSizesList([...item.soldOutSizes, size]);
    const nextStatus =
      nextAvail.length === 0 && nextSold.length > 0 ? 'sold_out' : 'active';
    patchItem(item.id, {
      availableSizes: nextAvail,
      soldOutSizes: nextSold,
      status: nextStatus,
      bucket:
        item.bucket === 'new_product'
          ? 'new_product'
          : nextAvail.length === 0 && nextSold.length > 0
            ? 'sold_out'
            : 'update',
      selected: true,
    });
  };

  const addSizeToItem = (item: AnalyzedPhotoItem) => {
    const raw = (sizeInputByItem[item.id] || '').trim().toUpperCase();
    if (!raw) return;
    const parts = raw
      .split(/[,.\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const nextAvail = sortSizesList(Array.from(new Set([...item.availableSizes, ...parts])));
    const nextSold = item.soldOutSizes.filter((s) => !parts.includes(s));
    patchItem(item.id, {
      availableSizes: nextAvail,
      soldOutSizes: nextSold,
      status: 'active',
      selected: true,
    });
    setSizeInputByItem((prev) => ({ ...prev, [item.id]: '' }));
  };

  const switchCandidate = (item: AnalyzedPhotoItem, targetProductId: string) => {
    if (targetProductId === '__NEW__') {
      const used = new Set(items.filter((i) => i.bucket === 'new_product').map((i) => i.suggestedSku));
      const newSku = generateNextSku(products, used);
      patchItem(item.id, {
        matchedProduct: null,
        bucket: 'new_product',
        replacePhoto: true,
        suggestedSku: newSku,
        selected: true,
      });
      return;
    }
    const found = products.find((p) => p.id === targetProductId);
    if (!found) return;
    const score =
      item.candidates.find((c) => c.product.id === found.id)?.score ?? item.matchScore;
    patchItem(item.id, {
      matchedProduct: found,
      matchScore: score,
      bucket: 'update',
      replacePhoto: false,
      suggestedSku: found.sku,
      title: found.title,
      brand: found.brand,
      quality: found.quality,
      department: found.department,
      categoryId: found.category_id,
      price: item.price ?? found.price,
      currency: item.price !== null ? item.currency : found.currency,
      availableSizes:
        item.availableSizes.length > 0
          ? item.availableSizes
          : found.sizes.filter((s) => !(found.sold_out_sizes || []).includes(s)),
      soldOutSizes:
        item.soldOutSizes.length > 0
          ? item.soldOutSizes
          : Array.isArray(found.sold_out_sizes)
            ? found.sold_out_sizes
            : [],
      selected: true,
    });
  };

  const handleApplySelected = async () => {
    const selectedItems = items.filter((it) => it.selected);
    if (selectedItems.length === 0) {
      onNotify('Marca al menos 1 tarjeta para aplicar.');
      return;
    }
    setApplying(true);
    setApplyProgress({ done: 0, total: selectedItems.length });
    let updatedCount = 0;
    let createdCount = 0;
    let failedCount = 0;
    const appliedIds = new Set<string>();

    try {
      for (let i = 0; i < selectedItems.length; i++) {
        const it = selectedItems[i];
        try {
          const allSizes = sortSizesList(
            Array.from(new Set([...it.availableSizes, ...it.soldOutSizes]))
          );
          const cleanSold = sortSizesList(it.soldOutSizes);

          if (it.bucket !== 'new_product' && it.matchedProduct) {
            const p = it.matchedProduct;
            let imageUrl = p.image_url;
            let imagePath = p.image_path;
            if (it.replacePhoto) {
              const opt = await optimizeImageToWebP(it.file);
              const uploaded = await uploadProductWebP(p.sku, opt.blob);
              imageUrl = uploaded.imageUrl;
              imagePath = uploaded.imagePath;
            }
            await saveProduct({
              id: p.id,
              sku: p.sku,
              title: it.title.trim() || p.title,
              brand: it.brand.trim() || p.brand,
              category_id: it.categoryId || p.category_id,
              department: it.department,
              quality: it.quality.trim() || p.quality,
              cost_price: p.cost_price,
              price: it.price,
              currency: it.currency,
              sizes: allSizes,
              sold_out_sizes: cleanSold,
              extra_images: p.extra_images || [],
              video_url: p.video_url || undefined,
              fit_note: p.fit_note,
              image_url: imageUrl,
              image_path: imagePath,
              status: it.status,
              featured: p.featured,
              price_preset_id: p.price_preset_id,
              source_group: p.source_group || 'yole-whatsapp',
              sort_order: p.sort_order ?? 999,
            });
            updatedCount++;
          } else {
            const opt = await optimizeImageToWebP(it.file);
            const uploaded = await uploadProductWebP(it.suggestedSku, opt.blob);
            await saveProduct({
              sku: it.suggestedSku.trim().toUpperCase(),
              title: it.title.trim() || `Modelo ${it.suggestedSku}`,
              brand: it.brand.trim() || 'Importado',
              category_id: it.categoryId || defaultCategoryId,
              department: it.department,
              quality: it.quality.trim() || '3A',
              cost_price: null,
              price: it.price,
              currency: it.currency,
              sizes: allSizes,
              sold_out_sizes: cleanSold,
              extra_images: [],
              video_url: undefined,
              fit_note: '',
              image_url: uploaded.imageUrl,
              image_path: uploaded.imagePath,
              status: it.status,
              featured: false,
              price_preset_id: null,
              source_group: 'yole-whatsapp',
              sort_order: products.length + createdCount + 1,
            });
            createdCount++;
          }
          appliedIds.add(it.id);
        } catch {
          failedCount++;
        }
        setApplyProgress({ done: i + 1, total: selectedItems.length });
      }

      setItems((prev) => {
        prev.filter((p) => appliedIds.has(p.id)).forEach((p) => URL.revokeObjectURL(p.previewUrl));
        return prev.filter((p) => !appliedIds.has(p.id));
      });
      await onRefresh();
      onNotify(
        `Sincronización completa: ${updatedCount} actualizados, ${createdCount} nuevos creados${
          failedCount > 0 ? `, ${failedCount} con error` : ''
        }.`
      );
    } finally {
      setApplying(false);
    }
  };

  const counts = useMemo(() => {
    const c = { all: items.length, update: 0, new_product: 0, sold_out: 0, unchanged: 0 };
    items.forEach((it) => {
      c[it.bucket]++;
    });
    return c;
  }, [items]);

  const visibleItems = useMemo(() => {
    if (bucketFilter === 'all') return items;
    return items.filter((it) => it.bucket === bucketFilter);
  }, [items, bucketFilter]);

  const selectedCount = items.filter((it) => it.selected).length;

  return (
    <div className="admin-section">
      <div className="admin-section__head">
        <div>
          <h2>Sincronizador masivo por fotos (WhatsApp → Catálogo)</h2>
          <p className="muted-sm">
            Sube todas las fotos del grupo (10, 50 u 80+ de golpe). Compara cada foto con tus{' '}
            <strong>{products.length}</strong> productos actuales en segundos sin pagar suscripciones.
          </p>
        </div>
        <div className="admin-toolbar-actions">
          <button
            type="button"
            className="btn btn--outline-dark btn--sm"
            disabled={indexing}
            onClick={() => ensureIndex()}
          >
            <RefreshCw size={14} className={indexing ? 'spin-icon' : ''} />
            <span>
              {indexing
                ? `Indexando ${indexProgress.done}/${indexProgress.total}...`
                : catalogFps
                  ? `Catálogo indexado (${catalogFps.size})`
                  : 'Indexar fotos actuales'}
            </span>
          </button>
          {items.length > 0 && (
            <button
              type="button"
              className="btn btn--outline-dark btn--sm"
              onClick={() => {
                items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
                setItems([]);
              }}
            >
              <Trash2 size={14} />
              <span>Limpiar lote</span>
            </button>
          )}
        </div>
      </div>

      {/* Config $0 Gratis */}
      <div className="sync-ai-card">
        <div className="sync-ai-card__row">
          <div>
            <strong>
              <Sparkles size={15} /> Modo de análisis (100% Gratis · $0)
            </strong>
            <p className="muted-sm">
              El comparador visual local ya encuentra qué zapato coincide sin API. Si además pegas una clave{' '}
              <strong>gratuita sin tarjeta</strong> de Google AI Studio o Groq, también lee precios, tallas y{' '}
              <code>❌</code> tachadas automáticamente.
            </p>
          </div>
          <div className="sync-ai-controls">
            <select
              value={aiCfg.provider}
              onChange={(e) =>
                updateAiCfg({ ...aiCfg, provider: e.target.value as AiVisionProvider })
              }
            >
              <option value="local_only">Solo comparador visual ($0 sin clave)</option>
              <option value="gemini_free">Google Gemini Flash (Gratis en aistudio.google.com)</option>
              <option value="groq_free">Groq Vision Llama 4 (Gratis en console.groq.com)</option>
            </select>

            {aiCfg.provider !== 'local_only' && (
              <div className="sync-key-wrap">
                <input
                  type={showKey ? 'text' : 'password'}
                  placeholder={
                    aiCfg.provider === 'gemini_free'
                      ? 'Pega tu API key gratis de Google AI Studio (AIza...)'
                      : 'Pega tu API key gratis de Groq (gsk_...)'
                  }
                  value={aiCfg.apiKey}
                  onChange={(e) => updateAiCfg({ ...aiCfg, apiKey: e.target.value })}
                />
                <button
                  type="button"
                  className="btn-icon-sm"
                  onClick={() => setShowKey((s) => !s)}
                  aria-label="Mostrar u ocultar clave"
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dropzone masiva */}
      <label className="sync-dropzone">
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={analyzing || applying}
          onChange={(e) => {
            void handleFilesSelected(e.target.files);
            e.target.value = '';
          }}
        />
        <Upload size={26} />
        <strong>
          {analyzing
            ? `Analizando lote: ${analyzeProgress.done} / ${analyzeProgress.total} fotos...`
            : 'Haz clic o arrastra aquí tus fotos nuevas del grupo (ej. 80 fotos juntas)'}
        </strong>
        <span>
          {indexing
            ? `Preparando índice visual del catálogo (${indexProgress.done}/${indexProgress.total})...`
            : 'Compara visualmente contra el catálogo, agrupa existentes vs nuevos y conserva tus WebP livianos.'}
        </span>
        {analyzing && (
          <button
            type="button"
            className="btn btn--outline-dark btn--sm"
            onClick={(e) => {
              e.preventDefault();
              cancelRef.current = true;
            }}
          >
            Detener análisis
          </button>
        )}
      </label>

      {items.length > 0 && (
        <>
          {/* Semáforo tabs + botón maestro */}
          <div className="sync-summary-bar">
            <div className="sync-bucket-tabs">
              <button
                type="button"
                className={bucketFilter === 'all' ? 'is-active' : ''}
                onClick={() => setBucketFilter('all')}
              >
                Todas ({counts.all})
              </button>
              <button
                type="button"
                className={bucketFilter === 'update' ? 'is-active' : ''}
                onClick={() => setBucketFilter('update')}
              >
                🟡 Actualizar ({counts.update})
              </button>
              <button
                type="button"
                className={bucketFilter === 'new_product' ? 'is-active' : ''}
                onClick={() => setBucketFilter('new_product')}
              >
                🔵 Nuevos ({counts.new_product})
              </button>
              <button
                type="button"
                className={bucketFilter === 'sold_out' ? 'is-active' : ''}
                onClick={() => setBucketFilter('sold_out')}
              >
                🔴 Agotados ({counts.sold_out})
              </button>
              <button
                type="button"
                className={bucketFilter === 'unchanged' ? 'is-active' : ''}
                onClick={() => setBucketFilter('unchanged')}
              >
                🟢 Sin cambios ({counts.unchanged})
              </button>
            </div>

            <button
              type="button"
              className="btn btn--primary"
              disabled={applying || selectedCount === 0}
              onClick={handleApplySelected}
            >
              {applying ? (
                <>
                  <Loader2 size={16} className="spin-icon" />
                  <span>
                    Aplicando {applyProgress.done}/{applyProgress.total}...
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  <span>Aplicar seleccionados ({selectedCount})</span>
                </>
              )}
            </button>
          </div>

          <div className="sync-cards-grid">
            {visibleItems.map((it) => {
              const allKnownSizes = sortSizesList(
                Array.from(new Set([...it.availableSizes, ...it.soldOutSizes]))
              );
              return (
                <article key={it.id} className={`sync-item-card is-${it.bucket}`}>
                  <div className="sync-item-card__top">
                    <label className="sync-check">
                      <input
                        type="checkbox"
                        checked={it.selected}
                        onChange={(e) => patchItem(it.id, { selected: e.target.checked })}
                      />
                      <span className={`sync-pill is-${it.bucket}`}>
                        {it.bucket === 'update'
                          ? '🟡 Actualizar'
                          : it.bucket === 'new_product'
                            ? '🔵 Nuevo modelo'
                            : it.bucket === 'sold_out'
                              ? '🔴 Agotado'
                              : '🟢 Sin cambios'}
                      </span>
                    </label>
                    <span className="sync-score">
                      {it.matchedProduct
                        ? `${Math.round(it.matchScore * 100)}% match · ${it.matchedProduct.sku}`
                        : `Nuevo · ${it.suggestedSku}`}
                    </span>
                  </div>

                  {/* Fotos lado a lado */}
                  <div className="sync-photos-compare">
                    <figure>
                      <img src={it.previewUrl} alt="Foto nueva" />
                      <figcaption>Foto nueva</figcaption>
                    </figure>
                    {it.matchedProduct ? (
                      <figure>
                        <img
                          src={resolveProductImageUrl(it.matchedProduct.sku, it.matchedProduct.image_url)}
                          alt={it.matchedProduct.title}
                        />
                        <figcaption>Actual ({it.matchedProduct.sku})</figcaption>
                      </figure>
                    ) : (
                      <div className="sync-photo-empty">
                        <ImagePlus size={20} />
                        <span>Producto nuevo</span>
                      </div>
                    )}
                  </div>

                  <p className="sync-ai-note">
                    <ScanSearch size={13} /> {it.aiNote}
                  </p>

                  {/* Selector de coincidencia */}
                  <div className="sync-field">
                    <label>Vincular con producto</label>
                    <select
                      value={it.matchedProduct?.id || '__NEW__'}
                      onChange={(e) => switchCandidate(it, e.target.value)}
                    >
                      <option value="__NEW__">➕ Crear como producto nuevo ({it.suggestedSku})</option>
                      {it.candidates.map((c) => (
                        <option key={c.product.id} value={c.product.id}>
                          {c.product.sku} · {c.product.title} ({Math.round(c.score * 100)}%)
                        </option>
                      ))}
                      {products.map((p) =>
                        it.candidates.some((c) => c.product.id === p.id) ? null : (
                          <option key={p.id} value={p.id}>
                            {p.sku} · {p.title}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  {/* Datos editables */}
                  <div className="sync-fields-row">
                    <div className="sync-field">
                      <label>Nombre</label>
                      <input
                        type="text"
                        value={it.title}
                        onChange={(e) => patchItem(it.id, { title: e.target.value, selected: true })}
                      />
                    </div>
                    <div className="sync-field sync-field--sm">
                      <label>Precio</label>
                      <div className="sync-price-group">
                        <input
                          type="number"
                          value={it.price ?? ''}
                          placeholder="Consultar"
                          onChange={(e) =>
                            patchItem(it.id, {
                              price: e.target.value ? Number(e.target.value) : null,
                              selected: true,
                            })
                          }
                        />
                        <select
                          value={it.currency}
                          onChange={(e) =>
                            patchItem(it.id, {
                              currency: e.target.value as Currency,
                              selected: true,
                            })
                          }
                        >
                          <option value="CUP">CUP</option>
                          <option value="USD">USD</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {it.bucket === 'new_product' && (
                    <div className="sync-fields-row">
                      <div className="sync-field sync-field--sm">
                        <label>SKU</label>
                        <input
                          type="text"
                          value={it.suggestedSku}
                          onChange={(e) =>
                            patchItem(it.id, { suggestedSku: e.target.value.toUpperCase() })
                          }
                        />
                      </div>
                      <div className="sync-field sync-field--sm">
                        <label>Departamento</label>
                        <select
                          value={it.department}
                          onChange={(e) =>
                            patchItem(it.id, { department: e.target.value as Department })
                          }
                        >
                          {Object.entries(DEPARTMENT_LABELS).map(([k, label]) => (
                            <option key={k} value={k}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="sync-field sync-field--sm">
                        <label>Calidad</label>
                        <input
                          type="text"
                          value={it.quality}
                          onChange={(e) => patchItem(it.id, { quality: e.target.value })}
                        />
                      </div>
                    </div>
                  )}

                  {/* Tallas interactivas */}
                  <div className="sync-sizes-box">
                    <div className="sync-sizes-head">
                      <span>Tallas (toca para marcar ❌ tachada/agotada)</span>
                      {it.matchedProduct && (
                        <small>
                          Antes:{' '}
                          {it.matchedProduct.price !== null
                            ? it.matchedProduct.currency === 'USD'
                              ? `$${it.matchedProduct.price} USD`
                              : formatCup(it.matchedProduct.price)
                            : 'N/D'}
                        </small>
                      )}
                    </div>
                    <div className="sync-size-chips">
                      {allKnownSizes.length === 0 ? (
                        <span className="muted-sm">
                          <AlertCircle size={13} /> Sin tallas detectadas aún — añade abajo:
                        </span>
                      ) : (
                        allKnownSizes.map((sz) => {
                          const isOut = it.soldOutSizes.includes(sz);
                          return (
                            <button
                              key={sz}
                              type="button"
                              className={`sync-size-chip${isOut ? ' is-crossed' : ''}`}
                              onClick={() => toggleSizeChip(it, sz)}
                              title={isOut ? 'Tachada / agotada (clic para reactivar)' : 'Disponible (clic para tachar)'}
                            >
                              {isOut ? `❌ ${sz}` : <><Check size={11} /> {sz}</>}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="sync-add-size">
                      <input
                        type="text"
                        placeholder="Añadir talla (ej. 42, 43 o M, L)"
                        value={sizeInputByItem[it.id] || ''}
                        onChange={(e) =>
                          setSizeInputByItem((prev) => ({ ...prev, [it.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addSizeToItem(it);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn--outline-dark btn--sm"
                        onClick={() => addSizeToItem(it)}
                      >
                        <Plus size={13} /> Añadir
                      </button>
                    </div>
                  </div>

                  {it.matchedProduct && (
                    <label className="sync-replace-photo">
                      <input
                        type="checkbox"
                        checked={it.replacePhoto}
                        onChange={(e) => patchItem(it.id, { replacePhoto: e.target.checked })}
                      />
                      <span>Reemplazar foto actual del catálogo por esta nueva (.webp)</span>
                    </label>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
