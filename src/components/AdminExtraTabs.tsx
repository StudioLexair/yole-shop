import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BellRing,
  Check,
  Copy,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import type {
  Coupon,
  CouponDiscountType,
  Department,
  SizeRequest,
  SizeRequestStatus,
  StoreSettings,
} from '../types';
import { DEPARTMENT_LABELS } from '../types';
import {
  deleteCoupon,
  deleteSizeRequest,
  fetchCoupons,
  fetchSizeRequests,
  saveCoupon,
  updateSizeRequestStatus,
} from '../lib/catalog';
import {
  clearStoreAnalytics,
  fetchStoreAnalytics,
  type StoreAnalyticsSummary,
} from '../lib/analytics';
import { buildWhatsAppUrl, formatCup, normalizeWhatsAppDigits } from '../lib/pricing';

export function AdminRequestsTab({
  settings,
  onToast,
}: {
  settings: StoreSettings;
  onToast: (msg: string) => void;
}) {
  const [requests, setRequests] = useState<SizeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await fetchSizeRequests());
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Error cargando solicitudes');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const demandGroups = useMemo(() => {
    const map = new Map<string, { sku: string; title: string; size: string; count: number }>();
    for (const r of requests) {
      if (r.status === 'surtido') continue;
      const key = `${r.sku}::${r.requested_size}`;
      const cur = map.get(key) || {
        sku: r.sku,
        title: r.product_title,
        size: r.requested_size,
        count: 0,
      };
      cur.count++;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [requests]);

  const handleStatus = async (id: string, status: SizeRequestStatus) => {
    try {
      await updateSizeRequestStatus(id, status);
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
      onToast(`Solicitud marcada como ${status}`);
    } catch {
      onToast('No se pudo actualizar el estado');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteSizeRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      onToast('Solicitud eliminada');
    } catch {
      onToast('No se pudo eliminar');
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Solicitudes "Encarga tu talla o modelo"</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Tallas o artículos agotados que los clientes pidieron en Santa Clara para tu próximo surtido.
          </p>
        </div>
        <button type="button" className="btn-outline" onClick={load}>
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>

      {demandGroups.length > 0 && (
        <div className="demand-summary">
          <strong>
            <BellRing size={14} /> Lo más pedido para surtir:
          </strong>
          <div className="demand-chips">
            {demandGroups.map((g) => (
              <span key={`${g.sku}-${g.size}`} className="demand-chip">
                <b>{g.count}x</b> {g.sku} · Talla <strong>{g.size}</strong>
                <small>{g.title}</small>
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <p className="muted-empty">Cargando solicitudes...</p>
      ) : requests.length === 0 ? (
        <p className="muted-empty">Aún no hay solicitudes de tallas pendientes.</p>
      ) : (
        <div className="orders-list">
          {requests.map((r) => {
            const clientDigits = normalizeWhatsAppDigits(r.customer_whatsapp || settings.whatsapp_number);
            const replyWa = buildWhatsAppUrl(
              clientDigits,
              `Hola ${r.customer_name || ''}, te escribimos de ${settings.store_name} sobre tu solicitud de [${r.sku}] ${r.product_title} en talla ${r.requested_size}. ¡Ya la tenemos disponible!`
            );
            return (
              <article key={r.id} className="order-card">
                <div className="order-card__head">
                  <div>
                    <strong>
                      [{r.sku}] {r.product_title} · Talla {r.requested_size}
                    </strong>
                    <span>
                      {r.customer_name || 'Cliente'} · WhatsApp: {r.customer_whatsapp} ·{' '}
                      {new Date(r.created_at).toLocaleString('es-ES')}
                    </span>
                    {r.note && <span style={{ display: 'block', marginTop: 2 }}>Nota: {r.note}</span>}
                  </div>
                  <div className="order-quick-pills">
                    {(['pendiente', 'contactado', 'surtido'] as SizeRequestStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        className={`chip chip--sm${r.status === st ? ' is-active' : ''}`}
                        onClick={() => void handleStatus(r.id, st)}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="order-card__actions">
                  <a
                    href={replyWa}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--whatsapp btn--sm"
                  >
                    <MessageCircle size={14} /> Avisar por WhatsApp
                  </a>
                  <button
                    type="button"
                    className="btn-del-row"
                    title="Eliminar"
                    onClick={() => void handleDelete(r.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AdminCouponsTab({ onToast }: { onToast: (msg: string) => void }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<CouponDiscountType>('percent');
  const [discountValue, setDiscountValue] = useState('10');
  const [department, setDepartment] = useState('all');
  const [minOrderUsd, setMinOrderUsd] = useState('0');
  const [vipLabel, setVipLabel] = useState('');
  const [isVip, setIsVip] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCoupons(await fetchCoupons());
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Error cargando cupones');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(discountValue);
    if (!code.trim() || !Number.isFinite(val) || val <= 0) {
      onToast('Escribe un código y un descuento válido.');
      return;
    }
    setCreating(true);
    try {
      await saveCoupon({
        code: code.trim().toUpperCase(),
        discount_type: discountType,
        discount_value: val,
        department,
        min_order_usd: Number(minOrderUsd) || 0,
        is_reseller_vip: isVip,
        vip_label: vipLabel.trim(),
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        active: true,
      });
      setCode('');
      setVipLabel('');
      await load();
      onToast('Cupón / Enlace VIP creado');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'No se pudo crear el cupón');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (c: Coupon) => {
    try {
      const updated = await saveCoupon({
        ...c,
        active: !c.active,
      });
      setCoupons((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
      onToast(`Cupón ${c.code} ${updated.active ? 'activado' : 'pausado'}`);
    } catch {
      onToast('Error actualizando cupón');
    }
  };

  const remove = async (c: Coupon) => {
    if (!window.confirm(`¿Eliminar cupón ${c.code}?`)) return;
    try {
      await deleteCoupon(c.id);
      setCoupons((prev) => prev.filter((x) => x.id !== c.id));
      onToast(`Cupón ${c.code} eliminado`);
    } catch {
      onToast('Error eliminando cupón');
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Cupones y Enlaces VIP (Revendedores / Promos)</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Crea códigos de descuento y comparte enlaces directos tipo{' '}
            <code>?vip=YOLE10</code> que aplican el beneficio automáticamente en el carrito.
          </p>
        </div>
        <button type="button" className="btn-outline" onClick={load}>
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>

      <form className="coupon-create-grid" onSubmit={handleCreate}>
        <input
          type="text"
          className="tbl-input"
          placeholder="Código (ej. VIP15, MAYORISTA)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          required
        />
        <select
          className="tbl-select"
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as CouponDiscountType)}
        >
          <option value="percent">% Descuento</option>
          <option value="fixed_usd">$ USD Fijo</option>
          <option value="fixed_cup">CUP Fijo</option>
        </select>
        <input
          type="number"
          step="any"
          min="1"
          className="tbl-input"
          placeholder="Valor"
          value={discountValue}
          onChange={(e) => setDiscountValue(e.target.value)}
          required
        />
        <select
          className="tbl-select"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        >
          <option value="all">Toda la tienda</option>
          {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((k) => (
            <option key={k} value={k}>
              {DEPARTMENT_LABELS[k]}
            </option>
          ))}
        </select>
        <input
          type="number"
          step="1"
          min="0"
          className="tbl-input"
          placeholder="Mínimo USD (0 = sin mín)"
          value={minOrderUsd}
          onChange={(e) => setMinOrderUsd(e.target.value)}
        />
        <input
          type="text"
          className="tbl-input"
          placeholder="Etiqueta VIP (ej. Revendedor)"
          value={vipLabel}
          onChange={(e) => setVipLabel(e.target.value)}
        />
        <input
          type="date"
          className="tbl-input"
          title="Fecha de expiración (opcional)"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />
        <label className="chk-inline">
          <input
            type="checkbox"
            checked={isVip}
            onChange={(e) => setIsVip(e.target.checked)}
          />
          <span>Enlace VIP / Revendedor</span>
        </label>
        <button type="submit" className="btn btn--primary" disabled={creating}>
          <Plus size={15} /> {creating ? 'Creando...' : 'Crear cupón'}
        </button>
      </form>

      {loading ? (
        <p className="muted-empty">Cargando cupones...</p>
      ) : (
        <div className="orders-list" style={{ marginTop: 16 }}>
          {coupons.map((c) => {
            const shareUrl = `https://yoleshop.ddns.net/?vip=${encodeURIComponent(c.code)}`;
            const discLabel =
              c.discount_type === 'percent'
                ? `${c.discount_value}% OFF`
                : c.discount_type === 'fixed_usd'
                  ? `-$${c.discount_value} USD`
                  : `-${formatCup(c.discount_value)}`;
            return (
              <article key={c.id} className="order-card">
                <div className="order-card__head">
                  <div>
                    <strong>
                      <Tag size={14} style={{ verticalAlign: 'middle' }} /> {c.code} · {discLabel}
                    </strong>
                    <span>
                      {c.vip_label || (c.is_reseller_vip ? 'VIP / Revendedor' : 'Cupón general')} ·{' '}
                      Usos: <b>{c.uses_count || 0}</b> ·{' '}
                      {c.department === 'all' ? 'Toda la tienda' : c.department}
                      {c.expires_at
                        ? ` · Vence ${new Date(c.expires_at).toLocaleDateString('es-ES')}`
                        : ''}
                    </span>
                  </div>
                  <div className="order-quick-pills">
                    <button
                      type="button"
                      className={`chip chip--sm${c.active ? ' is-active' : ''}`}
                      onClick={() => void toggleActive(c)}
                    >
                      {c.active ? 'Activo' : 'Pausado'}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => {
                        void navigator.clipboard?.writeText(shareUrl);
                        onToast(`Enlace VIP copiado: ${shareUrl}`);
                      }}
                    >
                      <Copy size={13} /> Copiar link VIP
                    </button>
                    <button
                      type="button"
                      className="btn-del-row"
                      onClick={() => void remove(c)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AdminAnalyticsTab({ onToast }: { onToast: (msg: string) => void }) {
  const [data, setData] = useState<StoreAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fetchStoreAnalytics(30));
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Error cargando analítica');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleClear = async () => {
    if (!window.confirm('¿Reiniciar contadores de analítica?')) return;
    try {
      await clearStoreAnalytics();
      await load();
      onToast('Analítica reiniciada');
    } catch {
      onToast('No se pudo limpiar la analítica');
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <h2>Analítica Real de la Tienda (Últimos 30 días)</h2>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
            Qué modelos ven más los clientes, cuáles piden más por WhatsApp y qué buscan sin stock.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-outline" onClick={load}>
            <RefreshCw size={15} /> Actualizar
          </button>
          <button type="button" className="btn-outline" onClick={() => void handleClear()}>
            <Trash2 size={15} /> Reiniciar
          </button>
        </div>
      </div>

      {loading || !data ? (
        <p className="muted-empty">Cargando métricas reales...</p>
      ) : (
        <>
          <div className="orders-summary-grid">
            <div className="kpi-card">
              <span>Vistas de producto</span>
              <strong>{data.totalViews}</strong>
            </div>
            <div className="kpi-card">
              <span>Agregados al carrito</span>
              <strong>{data.totalCartAdds}</strong>
            </div>
            <div className="kpi-card kpi-card--accent">
              <span>Clics a WhatsApp</span>
              <strong>{data.totalWhatsApp}</strong>
            </div>
            <div className={`kpi-card${data.totalEmptySearches > 0 ? ' kpi-card--warn' : ''}`}>
              <span>Búsquedas sin stock</span>
              <strong>{data.totalEmptySearches}</strong>
            </div>
          </div>

          <div className="analytics-cols">
            <div className="analytics-card">
              <h3>
                <BarChart3 size={16} /> Productos con mayor interés
              </h3>
              {data.topProducts.length === 0 ? (
                <p className="muted-empty">Aún no hay vistas registradas.</p>
              ) : (
                <div className="analytics-list">
                  {data.topProducts.map((row) => (
                    <div key={row.sku} className="analytics-row">
                      <div>
                        <strong>
                          [{row.sku}] {row.product_title}
                        </strong>
                      </div>
                      <div className="analytics-nums">
                        <span>{row.views} vistas</span>
                        <span>{row.cart_adds} carrito</span>
                        <b>{row.whatsapp_clicks} WA</b>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="analytics-card">
              <h3>
                <Search size={16} /> Búsquedas sin resultados (oportunidades de stock)
              </h3>
              {data.topEmptySearches.length === 0 ? (
                <p className="muted-empty">Sin búsquedas fallidas recientes.</p>
              ) : (
                <div className="analytics-list">
                  {data.topEmptySearches.map((q) => (
                    <div key={q.query} className="analytics-row">
                      <strong>&quot;{q.query}&quot;</strong>
                      <div className="analytics-nums">
                        <b>
                          <Check size={12} /> {q.count} búsquedas
                        </b>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
