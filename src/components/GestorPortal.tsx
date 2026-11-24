import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  Check,
  Clock,
  Copy,
  ExternalLink,
  LogOut,
  MessageCircle,
  Package,
  RefreshCw,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  Department,
  GestorOrderSummary,
  GestorProfile,
  Product,
  StoreSettings,
} from '../types';
import { DEPARTMENT_LABELS } from '../types';
import {
  buildGestorShareUrl,
  computeGestorProductPrice,
  fetchCurrentGestorProfile,
  fetchGestorReferralOrders,
  fetchOwnGestorPrices,
  loginGestorAccount,
  normalizeGestorSlug,
  registerGestorAccount,
  removeGestorProductPrice,
  saveGestorProductPrice,
  updateOwnGestorProfile,
} from '../lib/gestorService';
import { buildWhatsAppUrl, formatCup, formatUsd, normalizeWhatsAppDigits } from '../lib/pricing';
import { supabase } from '../lib/supabase';
import { SmartImage } from './SmartImage';

interface GestorPortalProps {
  products: Product[];
  settings: StoreSettings;
  onBackToStore: (previewSlug?: string) => void;
}

type GestorTab = 'prices' | 'profile' | 'orders';

function formatCubaPhoneInput(raw: string): string {
  const digitsOnly = raw.replace(/\D/g, '');
  let national = digitsOnly;
  if (digitsOnly.startsWith('0053')) {
    national = digitsOnly.slice(4);
  } else if (digitsOnly.startsWith('53') && digitsOnly.length >= 2) {
    national = digitsOnly.slice(2);
  }
  return `+53 ${national.slice(0, 10)}`;
}

export function GestorPortal({
  products,
  settings,
  onBackToStore,
}: GestorPortalProps) {
  const [profile, setProfile] = useState<GestorProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [toast, setToast] = useState('');

  // Registration fields (prefijo +53 predeterminado y sin auto-llenado cruzado)
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+53 ');
  const [ciNumber, setCiNumber] = useState('');
  const [address, setAddress] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [slugInput, setSlugInput] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [storeLabel, setStoreLabel] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Login fields
  const [loginId, setLoginId] = useState('');
  const [loginPass, setLoginPass] = useState('');

  // Active dashboard state
  const [tab, setTab] = useState<GestorTab>('prices');
  const [customPrices, setCustomPrices] = useState<Record<string, number>>({});
  const [draftInputs, setDraftInputs] = useState<Record<string, string>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [deptFilter, setDeptFilter] = useState<Department | 'all'>('all');
  const [markups, setMarkups] = useState<Partial<Record<Department, number>>>({});
  const [editStoreLabel, setEditStoreLabel] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('+53 ');
  const [editHideSku, setEditHideSku] = useState(true);
  const [orders, setOrders] = useState<GestorOrderSummary[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(''), 2800);
  }, []);

  const loadWorkspace = useCallback(async (g: GestorProfile) => {
    setProfile(g);
    setMarkups(g.default_markups || {});
    const safeLabel = (g.store_label || '').includes('@') ? '' : g.store_label || '';
    setEditStoreLabel(safeLabel);
    setEditWhatsapp(formatCubaPhoneInput(g.contact_whatsapp || g.phone || ''));
    setEditHideSku(g.hide_yole_sku !== false);

    if (g.status === 'active') {
      const [pricesMap, ordList] = await Promise.all([
        fetchOwnGestorPrices(g.id),
        fetchGestorReferralOrders(),
      ]);
      setCustomPrices(pricesMap);
      const initialDrafts: Record<string, string> = {};
      for (const [pid, val] of Object.entries(pricesMap)) {
        initialDrafts[pid] = String(val);
      }
      setDraftInputs(initialDrafts);
      setOrders(ordList);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    setLoadingAuth(true);
    try {
      const p = await fetchCurrentGestorProfile();
      if (p) {
        await loadWorkspace(p);
      } else {
        setProfile(null);
      }
    } finally {
      setLoadingAuth(false);
    }
  }, [loadWorkspace]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    if (fullName.trim().length < 4) {
      setErrMsg('Escribe tu nombre y apellidos completos.');
      return;
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setErrMsg('Completa tu número de teléfono cubano (ej. +53 50000000).');
      return;
    }
    if (ciNumber.replace(/\D/g, '').length !== 11) {
      setErrMsg('El Carnet de Identidad (CI) debe tener exactamente 11 dígitos.');
      return;
    }
    if (!municipality.trim()) {
      setErrMsg('Indica tu municipio y provincia.');
      return;
    }
    if (address.trim().length < 8) {
      setErrMsg('Escribe tu dirección completa (calle, número, entre calles y reparto).');
      return;
    }
    if (regPassword.length < 6) {
      setErrMsg('Crea una contraseña de al menos 6 caracteres.');
      return;
    }

    setBusy(true);
    try {
      const cleanLabel = storeLabel.trim().includes('@') ? '' : storeLabel.trim();
      const created = await registerGestorAccount({
        fullName,
        phone,
        ciNumber,
        address,
        municipality,
        slug: slugInput || fullName,
        storeLabel: cleanLabel,
        password: regPassword,
      });
      await loadWorkspace(created);
      showToast('Solicitud enviada. Pendiente de verificación manual.');
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'No se pudo completar el registro.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrMsg('');
    setBusy(true);
    try {
      const found = await loginGestorAccount(loginId, loginPass);
      if (!found) {
        setErrMsg('Esta cuenta no tiene perfil de Gestor PRO registrado.');
      } else {
        await loadWorkspace(found);
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Error al iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setCustomPrices({});
    setOrders([]);
  };

  const handleSaveMarkupsAndSettings = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const cleanLabel = editStoreLabel.trim().includes('@') ? '' : editStoreLabel.trim();
      const updated = await updateOwnGestorProfile(profile.id, {
        store_label: cleanLabel,
        contact_whatsapp: formatCubaPhoneInput(editWhatsapp).trim(),
        hide_yole_sku: editHideSku,
        default_markups: markups,
      });
      setProfile(updated);
      setEditStoreLabel(cleanLabel);
      showToast('Cambios guardados y aplicados a tu enlace');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Error guardando ajustes');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSinglePrice = async (p: Product, overrideValue?: number) => {
    if (!profile || profile.status !== 'active') return;
    const raw =
      overrideValue !== undefined
        ? String(overrideValue)
        : (draftInputs[p.id] ?? '').trim();

    if (!raw) {
      await removeGestorProductPrice(profile.id, p.id);
      setCustomPrices((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      showToast(`Precio de ${p.title.slice(0, 22)} restaurado a regla general`);
      return;
    }

    const num = Number(raw);
    const base = p.price ?? 0;
    if (!Number.isFinite(num) || num < base) {
      showToast(
        `El precio debe ser igual o mayor al base de Yole (${p.currency === 'CUP' ? formatCup(base) : formatUsd(base)})`
      );
      return;
    }

    setSavingProductId(p.id);
    try {
      await saveGestorProductPrice(profile.id, p.id, num);
      setCustomPrices((prev) => ({ ...prev, [p.id]: num }));
      setDraftInputs((prev) => ({ ...prev, [p.id]: String(num) }));
      showToast('Precio guardado');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'No se pudo guardar el precio');
    } finally {
      setSavingProductId(null);
    }
  };

  const handleResetSinglePrice = async (p: Product) => {
    if (!profile) return;
    setSavingProductId(p.id);
    try {
      await removeGestorProductPrice(profile.id, p.id);
      setCustomPrices((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      setDraftInputs((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      showToast('Restaurado a regla de departamento');
    } finally {
      setSavingProductId(null);
    }
  };

  const activeProducts = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    return products
      .filter((p) => p.status === 'active' && p.price !== null)
      .filter((p) => deptFilter === 'all' || p.department === deptFilter)
      .filter(
        (p) =>
          !q ||
          p.title.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [products, deptFilter, searchQ]);

  const activeDeptMarkupsCount = useMemo(
    () => Object.values(markups).filter((v) => Number(v) > 0).length,
    [markups]
  );

  const adminWaDigits = normalizeWhatsAppDigits(settings.whatsapp_number);

  return (
    <div className="gestor-shell">
      <header className="gestor-topbar">
        <div className="gestor-topbar__left">
          <button
            type="button"
            className="btn btn--outline-dark btn--sm"
            onClick={() => onBackToStore()}
          >
            <ArrowLeft size={15} /> Volver a tienda
          </button>
          <div className="gestor-brand-title">
            <span className="pro-badge">PRO</span>
            <strong>Portal de Gestores Yole Shop</strong>
          </div>
        </div>
        {profile && (
          <button
            type="button"
            className="btn btn--outline-dark btn--sm"
            onClick={() => void handleSignOut()}
          >
            <LogOut size={14} /> Salir
          </button>
        )}
      </header>

      <main className="gestor-main">
        {loadingAuth ? (
          <div className="gestor-card">
            <p className="muted-empty">Verificando sesión de Gestor...</p>
          </div>
        ) : !profile ? (
          /* ================= SIGNUP / LOGIN VIEW ================= */
          <div className="gestor-auth-wrap">
            <div className="gestor-hero-card">
              <span className="pro-badge">PROGRAMA GESTORES PRO</span>
              <h1>¿Quieres ser parte de Yole Shop?</h1>
              <p>
                Vende nuestro catálogo real de Tenis, Moda Shein, Motos y Equipos Solares con{' '}
                <strong>tus propios precios por encima</strong> y tu enlace personalizado. Sin
                confirmación de correo — validamos tu identidad manualmente para mantener la red segura.
              </p>
              <div className="gestor-benefits-row">
                <span>✓ Sin confirmación de Gmail</span>
                <span>✓ Tus clientes solo ven tus precios</span>
                <span>✓ Edita precios sin tocar inventario</span>
              </div>
            </div>

            <div className="gestor-card">
              <div className="gestor-auth-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'register'}
                  className={authMode === 'register' ? 'is-active' : ''}
                  onClick={() => {
                    setAuthMode('register');
                    setErrMsg('');
                  }}
                >
                  Solicitar Cuenta Gestor
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={authMode === 'login'}
                  className={authMode === 'login' ? 'is-active' : ''}
                  onClick={() => {
                    setAuthMode('login');
                    setErrMsg('');
                  }}
                >
                  Ya tengo cuenta
                </button>
              </div>

              {authMode === 'register' ? (
                <form className="gestor-form" autoComplete="off" noValidate onSubmit={handleRegister}>
                  <div className="gestor-form-grid">
                    <label className="field">
                      <span>Nombre y apellidos completos *</span>
                      <input
                        type="text"
                        name="gestor_full_name"
                        autoComplete="name"
                        data-lpignore="true"
                        placeholder="Ej. Carlos Manuel Pérez Díaz"
                        value={fullName}
                        onChange={(e) => {
                          const v = e.target.value;
                          setFullName(v);
                          if (!slugTouched) {
                            setSlugInput(normalizeGestorSlug(v.split(' ')[0] || ''));
                          }
                        }}
                      />
                    </label>

                    <label className="field">
                      <span>Teléfono / WhatsApp (Cuba +53) *</span>
                      <input
                        type="tel"
                        name="gestor_phone_cu"
                        autoComplete="off"
                        data-lpignore="true"
                        inputMode="tel"
                        placeholder="+53 50000000"
                        value={phone}
                        onChange={(e) => setPhone(formatCubaPhoneInput(e.target.value))}
                      />
                      <small className="field-hint">
                        Prefijo +53 listo — escribe tus 8 dígitos móviles.
                      </small>
                    </label>

                    <label className="field">
                      <span>Carnet de Identidad (CI · 11 dígitos) *</span>
                      <input
                        type="text"
                        name="gestor_ci_number"
                        autoComplete="off"
                        data-lpignore="true"
                        inputMode="numeric"
                        maxLength={11}
                        placeholder="Ej. 94051212345"
                        value={ciNumber}
                        onChange={(e) =>
                          setCiNumber(e.target.value.replace(/[^0-9]/g, '').slice(0, 11))
                        }
                      />
                    </label>

                    <label className="field">
                      <span>Municipio y Provincia *</span>
                      <input
                        type="text"
                        name="gestor_municipality"
                        autoComplete="off"
                        data-lpignore="true"
                        placeholder="Ej. Santa Clara, Villa Clara"
                        value={municipality}
                        onChange={(e) => setMunicipality(e.target.value)}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Dirección completa (Calle, número, entre calles, reparto) *</span>
                    <input
                      type="text"
                      name="gestor_street_address"
                      autoComplete="off"
                      data-lpignore="true"
                      placeholder="Ej. Calle Independencia #45 e/ Martí y Maceo, Reparto Centro"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </label>

                  <div className="gestor-form-grid">
                    <label className="field">
                      <span>Alias único para tu enlace (?g=ALIAS) *</span>
                      <input
                        type="text"
                        name="gestor_alias_slug"
                        autoComplete="off"
                        data-lpignore="true"
                        placeholder="Ej. CARLOS"
                        value={slugInput}
                        onChange={(e) => {
                          setSlugTouched(true);
                          setSlugInput(normalizeGestorSlug(e.target.value));
                        }}
                      />
                      <small className="field-hint">
                        Tu enlace oficial: <b>yoleshop.ddns.net/?g={slugInput || 'ALIAS'}</b>
                      </small>
                    </label>

                    <label className="field">
                      <span>Crea una contraseña para tu panel *</span>
                      <input
                        type="password"
                        name="gestor_new_password"
                        autoComplete="new-password"
                        data-lpignore="true"
                        minLength={6}
                        placeholder="Mínimo 6 caracteres"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                      />
                    </label>
                  </div>

                  <label className="field">
                    <span>Nombre público de tu catálogo (opcional)</span>
                    <input
                      type="text"
                      name="gestor_catalog_title"
                      autoComplete="off"
                      data-lpignore="true"
                      placeholder="Ej. Catálogo Carlos (si lo dejas vacío se muestra Yole Shop)"
                      value={storeLabel}
                      onChange={(e) => setStoreLabel(e.target.value)}
                    />
                  </label>

                  {errMsg && <p className="form-error">{errMsg}</p>}

                  <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
                    <Sparkles size={16} />
                    <span>
                      {busy ? 'Enviando solicitud...' : 'Enviar solicitud y registrarme'}
                    </span>
                  </button>
                </form>
              ) : (
                <form className="gestor-form" onSubmit={handleLogin}>
                  <label className="field">
                    <span>Teléfono o Alias de Gestor *</span>
                    <input
                      type="text"
                      required
                      name="gestor_login_identifier"
                      autoComplete="username"
                      placeholder="Ej. +53 50000000 o CARLOS"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Contraseña *</span>
                    <input
                      type="password"
                      required
                      name="gestor_login_password"
                      autoComplete="current-password"
                      placeholder="Tu contraseña"
                      value={loginPass}
                      onChange={(e) => setLoginPass(e.target.value)}
                    />
                  </label>
                  {errMsg && <p className="form-error">{errMsg}</p>}
                  <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
                    <span>{busy ? 'Entrando...' : 'Entrar a mi panel de Gestor'}</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : profile.status !== 'active' ? (
          /* ================= PENDING / SUSPENDED VIEW ================= */
          <div className="gestor-card gestor-status-card">
            <div className="gestor-status-icon">
              {profile.status === 'pending' ? (
                <Clock size={34} />
              ) : (
                <ShieldAlert size={34} />
              )}
            </div>
            <h1>
              {profile.status === 'pending'
                ? 'Solicitud en Verificación Manual'
                : profile.status === 'suspended'
                  ? 'Cuenta Pausada Temporalmente'
                  : 'Solicitud No Aprobada'}
            </h1>
            <p>
              {profile.status === 'pending'
                ? 'Tus datos fueron recibidos correctamente. El equipo de Yole Shop verificará tu Carnet de Identidad, teléfono y dirección para activar tu panel de edición de precios.'
                : 'Comunícate directamente con administración para revisar el estado de tu cuenta.'}
            </p>

            <div className="gestor-review-summary">
              <div>
                <small>Nombre</small>
                <strong>{profile.full_name}</strong>
              </div>
              <div>
                <small>Teléfono</small>
                <strong>{profile.phone}</strong>
              </div>
              <div>
                <small>CI</small>
                <strong>{profile.ci_number}</strong>
              </div>
              <div>
                <small>Alias asignado</small>
                <strong>?g={profile.slug}</strong>
              </div>
            </div>

            <div className="gestor-status-actions">
              <button
                type="button"
                className="btn btn--outline-dark"
                onClick={() => void refreshProfile()}
              >
                <RefreshCw size={15} /> Comprobar si ya me activaron
              </button>
              <a
                href={buildWhatsAppUrl(
                  adminWaDigits,
                  `Hola Yole Shop, acabo de solicitar mi cuenta Gestor PRO (${profile.full_name} · CI ${profile.ci_number} · Alias ?g=${profile.slug}). ¿Me pueden confirmar la activación?`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn--whatsapp"
              >
                <MessageCircle size={15} /> Avisar por WhatsApp para agilizar
              </a>
            </div>
          </div>
        ) : (
          /* ================= ACTIVE GESTOR PRICE EDITOR ================= */
          <div className="gestor-dashboard">
            <div className="gestor-link-banner">
              <div>
                <span className="gestor-active-pill">
                  <ShieldCheck size={14} /> Gestor Verificado · {profile.full_name}
                </span>
                <h2>Tu enlace personal: ?g={profile.slug}</h2>
                <p>
                  Cualquier cliente que entre por este enlace verá exclusivamente{' '}
                  <strong>tus precios editados</strong>, nunca los precios base de Yole Shop.
                </p>
              </div>
              <div className="gestor-link-actions">
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => {
                    const u = buildGestorShareUrl(profile.slug);
                    void navigator.clipboard?.writeText(u);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 1800);
                  }}
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedLink ? 'Enlace copiado' : 'Copiar mi enlace'}</span>
                </button>
                <a
                  href={`https://api.whatsapp.com/send/?text=${encodeURIComponent(
                    `Mira nuestro catálogo completo de Tenis, Moda Shein, Motos y Equipos Solares aquí: ${buildGestorShareUrl(profile.slug)}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--whatsapp btn--sm"
                >
                  <Share2 size={14} /> Compartir por WhatsApp
                </a>
                <button
                  type="button"
                  className="btn btn--outline-dark btn--sm"
                  onClick={() => onBackToStore(profile.slug)}
                >
                  <ExternalLink size={14} /> Ver mi tienda en vivo
                </button>
              </div>
            </div>

            <div className="gestor-kpi-strip">
              <div className="gestor-kpi-pill">
                <small>Productos editables</small>
                <strong>{products.filter((x) => x.status === 'active' && x.price !== null).length}</strong>
              </div>
              <div className="gestor-kpi-pill">
                <small>Precios fijos tuyos</small>
                <strong>{Object.keys(customPrices).length}</strong>
              </div>
              <div className="gestor-kpi-pill">
                <small>Márgenes por depto</small>
                <strong>{activeDeptMarkupsCount}</strong>
              </div>
              <div className="gestor-kpi-pill">
                <small>Pedidos enlazados</small>
                <strong>{orders.length}</strong>
              </div>
            </div>

            <div className="gestor-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'prices'}
                className={tab === 'prices' ? 'is-active' : ''}
                onClick={() => setTab('prices')}
              >
                <Briefcase size={15} /> Editar Mis Precios ({Object.keys(customPrices).length} fijos)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'profile'}
                className={tab === 'profile' ? 'is-active' : ''}
                onClick={() => setTab('profile')}
              >
                <Sparkles size={15} /> Márgenes &amp; Mi Tienda
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'orders'}
                className={tab === 'orders' ? 'is-active' : ''}
                onClick={() => setTab('orders')}
              >
                <Package size={15} /> Mis Pedidos ({orders.length})
              </button>
            </div>

            {tab === 'prices' && (
              <div className="gestor-card">
                <div className="gestor-toolbar">
                  <div className="gestor-search-wrap">
                    <Search size={15} />
                    <input
                      type="search"
                      placeholder="Buscar producto por nombre, marca o SKU..."
                      value={searchQ}
                      onChange={(e) => setSearchQ(e.target.value)}
                    />
                  </div>
                  <select
                    value={deptFilter}
                    onChange={(e) => setDeptFilter(e.target.value as Department | 'all')}
                  >
                    <option value="all">Todos los departamentos</option>
                    {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((d) => (
                      <option key={d} value={d}>
                        {DEPARTMENT_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>

                <p className="gestor-readonly-note">
                  Solo puedes ajustar <strong>tu precio de venta por encima</strong> del precio
                  base de Yole Shop. El catálogo, fotos y stock permanecen protegidos.
                </p>

                <div className="gestor-price-list">
                  {activeProducts.map((p) => {
                    const base = p.price ?? 0;
                    const effective =
                      computeGestorProductPrice(
                        p,
                        { default_markups: markups, prices: customPrices },
                        settings.usd_to_cup_rate
                      ) ?? base;
                    const draftRaw = draftInputs[p.id];
                    const parsedDraft =
                      draftRaw !== undefined && draftRaw.trim() !== '' ? Number(draftRaw) : effective;
                    const previewPrice = Number.isFinite(parsedDraft) ? parsedDraft : effective;
                    const belowFloor = previewPrice < base;
                    const gain = Math.max(0, Math.round((previewPrice - base) * 100) / 100);
                    const hasManual = customPrices[p.id] !== undefined;
                    const isSaving = savingProductId === p.id;
                    const quickSteps = p.currency === 'CUP' ? [2000, 5000] : [5, 10, 25];

                    return (
                      <div key={p.id} className="gestor-price-row">
                        <SmartImage
                          src={p.image_url}
                          alt={p.title}
                          variant="compact"
                          width={52}
                          height={52}
                          wrapperClassName="gestor-price-row__img"
                        />
                        <div className="gestor-price-row__info">
                          <strong>{p.title}</strong>
                          <small>
                            Base Yole:{' '}
                            <b>{p.currency === 'CUP' ? formatCup(base) : formatUsd(base)}</b> ·{' '}
                            {belowFloor ? (
                              <span className="err-txt">
                                Mínimo permitido:{' '}
                                {p.currency === 'CUP' ? formatCup(base) : formatUsd(base)}
                              </span>
                            ) : (
                              <>
                                Tu venta:{' '}
                                <span className="gain-txt">
                                  {p.currency === 'CUP'
                                    ? formatCup(previewPrice)
                                    : formatUsd(previewPrice)}{' '}
                                  (+{p.currency === 'CUP' ? formatCup(gain) : formatUsd(gain)})
                                </span>
                              </>
                            )}
                          </small>
                        </div>
                        <div className="gestor-price-row__edit">
                          <div className="gestor-quick-bumps">
                            {quickSteps.map((step) => (
                              <button
                                key={step}
                                type="button"
                                className="btn-quick-bump"
                                disabled={isSaving}
                                onClick={() => {
                                  const nextVal = Math.max(base, effective) + step;
                                  setDraftInputs((prev) => ({ ...prev, [p.id]: String(nextVal) }));
                                  void handleSaveSinglePrice(p, nextVal);
                                }}
                                title={`Sumar +${step} ${p.currency} y guardar`}
                              >
                                +{step >= 1000 ? `${step / 1000}k` : `$${step}`}
                              </button>
                            ))}
                          </div>
                          <div className="gestor-input-currency">
                            <input
                              type="number"
                              min={base}
                              step="any"
                              placeholder={String(effective)}
                              value={draftInputs[p.id] ?? String(effective)}
                              onChange={(e) =>
                                setDraftInputs((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                            />
                            <span>{p.currency}</span>
                          </div>
                          <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={isSaving || belowFloor}
                            onClick={() => void handleSaveSinglePrice(p)}
                          >
                            {isSaving ? '...' : 'Guardar'}
                          </button>
                          {hasManual && (
                            <button
                              type="button"
                              className="btn-ghost-sm"
                              disabled={isSaving}
                              onClick={() => void handleResetSinglePrice(p)}
                              title="Volver a usar el margen automático del departamento"
                            >
                              Auto
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'profile' && (
              <div className="gestor-card">
                <h3>Márgenes automáticos por departamento (+ USD encima de Yole)</h3>
                <p className="gestor-readonly-note">
                  Si un producto no tiene un precio manual fijado arriba, se le sumará
                  automáticamente este margen (convertido a CUP en calzado).
                </p>
                <div className="rates-grid" style={{ marginBottom: 18 }}>
                  {(Object.keys(DEPARTMENT_LABELS) as Department[]).map((dep) => (
                    <div key={dep} className="rate-cell">
                      <strong>{DEPARTMENT_LABELS[dep]}</strong>
                      <div className="gestor-input-currency">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={markups[dep] ?? 0}
                          onChange={(e) =>
                            setMarkups((prev) => ({
                              ...prev,
                              [dep]: Math.max(0, Number(e.target.value) || 0),
                            }))
                          }
                        />
                        <span>+USD</span>
                      </div>
                    </div>
                  ))}
                </div>

                <h3>Identidad pública en tu enlace (?g={profile.slug})</h3>
                <div className="gestor-form-grid" style={{ marginTop: 10 }}>
                  <label className="field">
                    <span>Nombre visible de tu tienda</span>
                    <input
                      type="text"
                      name="gestor_store_display"
                      autoComplete="off"
                      data-lpignore="true"
                      placeholder="Ej. Catálogo Carlos (opcional)"
                      value={editStoreLabel}
                      onChange={(e) => setEditStoreLabel(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>WhatsApp que recibe los pedidos de tus clientes</span>
                    <input
                      type="tel"
                      name="gestor_wa_display"
                      autoComplete="off"
                      data-lpignore="true"
                      placeholder="+53 50000000"
                      value={editWhatsapp}
                      onChange={(e) => setEditWhatsapp(formatCubaPhoneInput(e.target.value))}
                    />
                  </label>
                </div>

                <label className="sheet-check-row" style={{ margin: '12px 0' }}>
                  <input
                    type="checkbox"
                    checked={editHideSku}
                    onChange={(e) => setEditHideSku(e.target.checked)}
                  />
                  <span>Ocultar códigos SKU internos de Yole Shop a mis clientes</span>
                </label>

                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => void handleSaveMarkupsAndSettings()}
                >
                  <Check size={15} /> {busy ? 'Guardando...' : 'Guardar configuración y márgenes'}
                </button>
              </div>
            )}

            {tab === 'orders' && (
              <div className="gestor-card">
                <h3>Pedidos registrados desde tu enlace (?g={profile.slug})</h3>
                {orders.length === 0 ? (
                  <p className="muted-empty">
                    Aún no hay pedidos registrados con tu enlace. Comparte tu URL para empezar.
                  </p>
                ) : (
                  <div className="orders-list">
                    {orders.map((ord) => (
                      <article key={ord.order_code} className="order-card">
                        <div className="order-card__head">
                          <div>
                            <strong>{ord.order_code}</strong>
                            <span>
                              {ord.items_count} artículo(s) ·{' '}
                              {new Date(ord.created_at).toLocaleString('es-ES')}
                            </span>
                          </div>
                          <div className="order-quick-pills">
                            <span className="chip chip--sm is-active">{ord.status}</span>
                            <strong>{formatUsd(ord.subtotal_usd)}</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {toast && (
        <div className="gestor-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
