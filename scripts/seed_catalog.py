#!/usr/bin/env python3
"""
Optimiza las 219 imágenes válidas de tienda01/tienda02 a WebP sin pérdida visual perceptible,
recorta UI/bordes negros de screenshots seleccionados, las sube a Supabase Storage (yole-products)
e inserta/actualiza el catálogo completo en Postgres public.products.
"""
import concurrent.futures
import json
import os
import sys
import urllib.request
import urllib.error
from pathlib import Path
from PIL import Image, ImageOps

SUPABASE_URL = "https://lroyrrgcjjtijwutykzm.supabase.co"
BUCKET = "yole-products"
MANIFEST_PATH = Path("/tmp/tienda_analisis/sheets/manifest.txt")
WEBP_DIR = Path("/tmp/tienda_analisis/webp")

# Load keys from environment or Supabase API token
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SB_MANAGEMENT_TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
if not SB_MANAGEMENT_TOKEN:
    tok_file = Path("/home/user/uploads/tokens studio lexair supabase.txt")
    if tok_file.exists():
        SB_MANAGEMENT_TOKEN = tok_file.read_text().strip()

if not SERVICE_KEY and SB_MANAGEMENT_TOKEN:
    req = urllib.request.Request(
        "https://api.supabase.com/v1/projects/lroyrrgcjjtijwutykzm/api-keys",
        headers={
            "Authorization": f"Bearer {SB_MANAGEMENT_TOKEN}",
            "User-Agent": "YoleShopSeeder/1.0",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        keys = json.loads(resp.read().decode("utf-8"))
        for k in keys:
            if k.get("name") == "service_role":
                SERVICE_KEY = k["api_key"]
                break

if not SERVICE_KEY:
    sys.exit("Missing SUPABASE_SERVICE_ROLE_KEY")

# ---------------------------------------------------------------------------
# Catálogo completo y exacto (transcripción verificada en HD foto por foto)
# Tuple: (idx, sku, title, brand, dept, cat, quality, currency, price, sizes, fit_note, status, featured, source_group, trim_bars)
# ---------------------------------------------------------------------------
CATALOG = [
    # --- Calzado & Tenis (000..103 + 221; excluye 028 duplicado y 104 cartel) ---
    (0, "YOL-000", "Zuecos Boston Suede Hebilla Gris", "Boston", "calzado", "zuecos-sandalias", "Importado", "CUP", None, ["42"], "También disponible en negras · Consultar precio", "active", False, "tienda01_root", False),
    (1, "YOL-001", "Champion Chunky Crema & Azul Marino", "Champion", "calzado", "tenis-champion-osiris", "3A", "CUP", 35000, ["39", "40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (2, "YOL-002", "Champion Chunky Blanco & Verde", "Champion", "calzado", "tenis-champion-osiris", "3A", "CUP", 35000, ["39", "40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (3, "YOL-003", "New Balance 9060 Blanco & Rosa", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["36", "37", "38", "39", "40", "41"], "", "active", True, "bombazo_calzado", False),
    (4, "YOL-004", "New Balance 9060 Blanco & Negro", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["36", "37", "38", "39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (5, "YOL-005", "New Balance 9060 Blanco & Arena", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["37"], "Último par talla 37", "active", False, "bombazo_calzado", False),
    (6, "YOL-006", "Air Jordan 4 Pure White", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["42"], "Último par talla 42", "active", False, "bombazo_calzado", False),
    (7, "YOL-007", "New Balance 9060 Café Taupe", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["37", "39", "40"], "", "active", False, "bombazo_calzado", False),
    (8, "YOL-008", "Air Jordan 4 Negro & Fucsia", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["36"], "Último par talla 36", "active", False, "bombazo_calzado", False),
    (9, "YOL-009", "Air Jordan 4 Lakers Negro & Morado", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["41", "42", "43", "44"], "", "active", True, "bombazo_calzado", False),
    (10, "YOL-010", "Air Jordan 4 Blanco & Azul Marino", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["40", "41"], "", "active", False, "bombazo_calzado", False),
    (11, "YOL-011", "New Balance 9060 Gris Perla & Rosa", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["36", "37", "38", "39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (12, "YOL-012", "Osiris D3 Chunky Triple Negro", "Osiris", "calzado", "tenis-champion-osiris", "3A", "CUP", 40000, ["39", "40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (13, "YOL-013", "Air Jordan 4 Negro & Morado Oro (Detalle)", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (14, "YOL-014", "Osiris D3 Blanco & Rojo", "Osiris", "calzado", "tenis-champion-osiris", "3A", "CUP", 40000, ["39", "40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (15, "YOL-015", "Osiris D3 Negro & Blanco", "Osiris", "calzado", "tenis-champion-osiris", "3A", "CUP", 40000, ["39", "40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (16, "YOL-016", "New Balance 9060 Blanco & Lila", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["36", "37", "38", "39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (17, "YOL-017", "Champion Skate Negro & Blanco", "Champion", "calzado", "tenis-champion-osiris", "3A", "CUP", 35000, ["39", "40", "41", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (18, "YOL-018", "Osiris D3 Negro Gris & Rojo", "Osiris", "calzado", "tenis-champion-osiris", "3A", "CUP", 40000, ["39", "40"], "", "active", False, "bombazo_calzado", False),
    (19, "YOL-019", "Champion Chunky Blanco & Negro", "Champion", "calzado", "tenis-champion-osiris", "3A", "CUP", 35000, ["39", "40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (20, "YOL-020", "Air Jordan 4 Negro Rojo & Gris", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["38", "39", "41", "42", "43"], "", "active", False, "bombazo_calzado", False),
    (21, "YOL-021", "Champion Chunky Marrón & Crema", "Champion", "calzado", "tenis-champion-osiris", "3A", "CUP", 35000, ["39", "40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (22, "YOL-022", "Champion Chunky Blanco Rosa & Turquesa", "Champion", "calzado", "tenis-champion-osiris", "3A", "CUP", 35000, ["36", "37", "38", "39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (23, "YOL-023", "Osiris D3 Gris Lavanda", "Osiris", "calzado", "tenis-champion-osiris", "3A", "CUP", 40000, ["39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (24, "YOL-024", "Osiris D3 Blanco & Negro", "Osiris", "calzado", "tenis-champion-osiris", "3A", "CUP", 40000, ["39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (25, "YOL-025", "Nike Shox TL Negro & Rojo", "Nike", "calzado", "tenis-nike", "3A", "CUP", 40000, ["39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (26, "YOL-026", "Nike Shox TL Gris & Negro", "Nike", "calzado", "tenis-nike", "3A", "CUP", 40000, ["39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (27, "YOL-027", "Nike Shox TL Blanco & Negro", "Nike", "calzado", "tenis-nike", "3A", "CUP", 40000, ["39", "40", "41", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (29, "YOL-029", "Nike Air Force 1 Low Blanco", "Nike", "calzado", "tenis-nike", "G5", "CUP", 30000, ["41", "42", "43", "44"], "Calidad G5 Premium", "active", True, "bombazo_calzado", False),
    (30, "YOL-030", "Nike Shox R4 Blanco & Plata", "Nike", "calzado", "tenis-nike", "G5", "CUP", 45000, ["40", "41", "42", "43", "44"], "Calidad G5 Premium", "active", True, "bombazo_calzado", False),
    (31, "YOL-031", "New Balance 9060 Beige Crema", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["38"], "Último par talla 38", "active", False, "bombazo_calzado", False),
    (32, "YOL-032", "Air Jordan 4 Blanco & Morado Charms", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["36", "37", "38", "39"], "Incluye pins/charms decorativos", "active", False, "bombazo_calzado", False),
    (33, "YOL-033", "Nike M2K Tekno Blanco Negro & Rojo", "Nike", "calzado", "tenis-nike", "3A", "CUP", 30000, ["42", "43", "44", "45", "46"], "Horma amplia (+1 talla)", "active", False, "bombazo_calzado", False),
    (34, "YOL-034", "Air Jordan 4 Blanco & Celeste Charms", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["36", "37", "38", "39", "40", "41"], "Incluye pins/charms decorativos", "active", False, "bombazo_calzado", False),
    (35, "YOL-035", "Air Jordan 4 Black Cat Negro", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["38", "39", "40", "41", "42"], "", "active", True, "bombazo_calzado", False),
    (36, "YOL-036", "Air Jordan 4 Blanco & Rosa Pastel Charms", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["36", "37", "38", "39", "40", "41"], "Incluye pins/charms decorativos", "active", False, "bombazo_calzado", False),
    (37, "YOL-037", "Air Jordan 4 Black Cat Gamuza", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (38, "YOL-038", "Air Jordan 4 Negro Blanco & Dorado", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["40", "41", "42", "43"], "", "active", False, "bombazo_calzado", False),
    (39, "YOL-039", "Air Jordan 4 Oreo Negro & Blanco", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["36", "37", "38", "39", "40", "41", "42", "43"], "", "active", False, "bombazo_calzado", False),
    (40, "YOL-040", "Air Jordan 4 Thunder Negro & Amarillo", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["41", "43"], "", "active", False, "bombazo_calzado", False),
    (41, "YOL-041", "Air Jordan 4 Red Thunder Negro & Rojo", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["39", "40", "41", "42", "43"], "", "active", True, "bombazo_calzado", False),
    (42, "YOL-042", "New Balance 9060 Marrón & Arena", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["40", "41", "43"], "", "active", False, "bombazo_calzado", False),
    (43, "YOL-043", "Nike Shox R4 Plata Negro & Rojo", "Nike", "calzado", "tenis-nike", "G5", "CUP", 45000, ["40", "43"], "Calidad G5 · Horma reducida (-1 talla)", "active", False, "bombazo_calzado", False),
    (44, "YOL-044", "New Balance 9060 Beige Arena", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["43", "44", "45"], "", "active", False, "bombazo_calzado", False),
    (45, "YOL-045", "Adidas Campus 00s Negro & Blanco", "Adidas", "calzado", "tenis-adidas", "3A", "CUP", 25000, ["40", "41", "42", "43"], "", "active", True, "bombazo_calzado", False),
    (46, "YOL-046", "New Balance 9060 Negro & Gris", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (47, "YOL-047", "Nike Air Max 90 Blanco Negro & Rojo", "Nike", "calzado", "tenis-nike", "3A", "CUP", 30000, ["39", "40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (48, "YOL-048", "Louis Vuitton Skate Negro & Blanco", "Louis Vuitton", "calzado", "tenis-lv-urbanos", "3A", "CUP", 30000, ["39", "40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (49, "YOL-049", "Nike Shox R4 Triple Negro", "Nike", "calzado", "tenis-nike", "G5", "CUP", 45000, ["40", "41"], "Calidad G5 Premium", "active", False, "bombazo_calzado", False),
    (50, "YOL-050", "Nike Air Max Plus TN Negro & Rojo", "Nike", "calzado", "tenis-nike", "3A", "CUP", 35000, ["40"], "Último par talla 40", "active", False, "bombazo_calzado", False),
    (51, "YOL-051", "Nike Air Max Plus TN Negro & Azul", "Nike", "calzado", "tenis-nike", "3A", "CUP", 35000, ["40", "41"], "", "active", False, "bombazo_calzado", False),
    (52, "YOL-052", "Adidas Campus 00s Gris & Negro", "Adidas", "calzado", "tenis-adidas", "3A", "CUP", 25000, ["41"], "Último par talla 41", "active", False, "bombazo_calzado", False),
    (53, "YOL-053", "Adidas Campus 00s Azul Marino & Blanco", "Adidas", "calzado", "tenis-adidas", "3A", "CUP", 25000, ["40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (54, "YOL-054", "Nike Air Max Plus TN Negro & Dorado", "Nike", "calzado", "tenis-nike", "3A", "CUP", 35000, ["40"], "Último par talla 40", "active", False, "bombazo_calzado", False),
    (55, "YOL-055", "New Balance 9060 Gris Claro", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["44"], "Último par talla 44", "active", False, "bombazo_calzado", False),
    (56, "YOL-056", "New Balance 9060 Blanco & Negro Suela Crema", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["40", "43"], "", "active", False, "bombazo_calzado", False),
    (57, "YOL-057", "New Balance 9060 Gris Oscuro", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["39", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (58, "YOL-058", "New Balance 9060 Blanco Hielo", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 30000, ["43"], "Último par talla 43", "active", False, "bombazo_calzado", False),
    (59, "YOL-059", "New Balance 9060 Triple Negro", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["39", "41", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (60, "YOL-060", "Air Jordan 13 Rojo Gris & Blanco", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (61, "YOL-061", "Air Jordan 13 Negro & Rojo", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 25000, ["41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (62, "YOL-062", "New Balance 9060 Café Oscuro", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["38", "39"], "", "active", False, "bombazo_calzado", False),
    (63, "YOL-063", "Tenis Basket Blanco & Azul Marino", "Sport", "calzado", "tenis-nike", "3A", "CUP", 12500, ["39"], "Oferta especial · Último par talla 39", "active", False, "bombazo_calzado", False),
    (64, "YOL-064", "New Balance 9060 Blanco & Salmón Pastel", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["37", "38", "39"], "", "active", False, "bombazo_calzado", False),
    (65, "YOL-065", "Nike M2K Tekno Crema & Negro", "Nike", "calzado", "tenis-nike", "3A", "CUP", 30000, ["42", "43", "44", "45", "46"], "Horma amplia (+1 talla)", "active", False, "bombazo_calzado", False),
    (66, "YOL-066", "New Balance 9060 Crema Dorado & Rosa", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["37"], "Último par talla 37", "active", False, "bombazo_calzado", False),
    (67, "YOL-067", "New Balance 9060 Rosa Palo & Blanco", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["38", "39"], "Horma amplia (+1 talla)", "active", False, "bombazo_calzado", False),
    (68, "YOL-068", "New Balance 9060 Blanco Morado & Magenta", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["36", "38", "39", "40"], "", "active", False, "bombazo_calzado", False),
    (69, "YOL-069", "Nike Running Crema & Plata", "Nike", "calzado", "tenis-nike", "3A", "CUP", 18000, ["39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (70, "YOL-070", "New Balance 9060 Gris Textura Denim", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 35000, ["39.5"], "Último par talla 39.5", "active", False, "bombazo_calzado", False),
    (71, "YOL-071", "Adidas Campus 00s Negro & Dorado", "Adidas", "calzado", "tenis-adidas", "3A", "CUP", 25000, ["40", "41", "42"], "", "active", False, "bombazo_calzado", False),
    (72, "YOL-072", "Air Jordan 4 Negro & Suela Blanca Gamuza", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["40", "41", "42"], "", "active", False, "bombazo_calzado", False),
    (73, "YOL-073", "Adidas Campus 00s Rosa Pastel Estampado", "Adidas", "calzado", "tenis-adidas", "3A", "CUP", 25000, ["36"], "Último par talla 36", "active", False, "bombazo_calzado", False),
    (74, "YOL-074", "Air Jordan 4 Fire Red Blanco & Rojo", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["39", "40", "41", "42", "43"], "", "active", False, "bombazo_calzado", False),
    (75, "YOL-075", "Air Jordan 4 Midnight Navy", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["39", "41"], "", "active", False, "bombazo_calzado", False),
    (76, "YOL-076", "Louis Vuitton Monogram Blanco & Gris", "Louis Vuitton", "calzado", "tenis-lv-urbanos", "3A", "CUP", 20000, ["40", "41", "44"], "", "active", False, "bombazo_calzado", False),
    (77, "YOL-077", "Louis Vuitton Monogram Negro & Suela Blanca", "Louis Vuitton", "calzado", "tenis-lv-urbanos", "3A", "CUP", 20000, ["41", "42", "43", "44", "45"], "", "active", False, "bombazo_calzado", False),
    (78, "YOL-078", "Louis Vuitton Monogram Denim Oscuro", "Louis Vuitton", "calzado", "tenis-lv-urbanos", "3A", "CUP", 20000, ["40", "41", "42", "43", "44"], "", "active", False, "bombazo_calzado", False),
    (79, "YOL-079", "New Balance 9060 Rosa Gris & Mostaza", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 20000, ["39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (80, "YOL-080", "Air Jordan 4 Negro & Rojo Suela Roja", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 20000, ["40", "41", "42", "43", "44", "45"], "", "active", False, "bombazo_calzado", False),
    (81, "YOL-081", "Louis Vuitton Monogram Triple Negro", "Louis Vuitton", "calzado", "tenis-lv-urbanos", "3A", "CUP", 20000, ["41", "42", "43", "44", "45"], "", "active", False, "bombazo_calzado", False),
    (82, "YOL-082", "Air Jordan 4 x Supreme Blanco & Rojo", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 25000, ["40", "41", "42", "43", "44", "45"], "", "active", True, "bombazo_calzado", False),
    (83, "YOL-083", "New Balance 9060 Gris & Amarillo Pastel", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 20000, ["36", "37", "38", "39", "40", "41"], "", "active", False, "bombazo_calzado", False),
    (84, "YOL-084", "Air Jordan 4 Gris Negro & Blanco", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["39", "40", "41", "42", "43"], "", "active", False, "bombazo_calzado", False),
    (85, "YOL-085", "Air Jordan 4 Blanco & Oliva Gris", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["40", "41", "42"], "", "active", False, "bombazo_calzado", False),
    (86, "YOL-086", "Air Jordan 4 Crema Morado & Rojo", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["41", "42", "43"], "", "active", False, "bombazo_calzado", False),
    (87, "YOL-087", "Nike LeBron XXI Lakers Morado & Oro", "Nike", "calzado", "tenis-nike", "G5", "USD", 60, ["43.5"], "Calidad G5 · Horma reducida (-1 talla)", "active", True, "bombazo_calzado", False),
    (88, "YOL-088", "Nike Air Force 1 Mid Blanco & Rosa", "Nike", "calzado", "tenis-nike", "3A", "CUP", 25000, ["40", "41"], "", "active", False, "bombazo_calzado", False),
    (89, "YOL-089", "Air Jordan 4 Negro Swoosh Blanco", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 30000, ["41", "42", "43"], "", "active", False, "bombazo_calzado", False),
    (90, "YOL-090", "Nike Air Force 1 Low Triple Blanco", "Nike", "calzado", "tenis-nike", "3A", "CUP", 25000, ["36", "40", "41", "43"], "", "active", False, "bombazo_calzado", False),
    (91, "YOL-091", "Amiri Bone Runner Blanco", "Amiri", "calzado", "tenis-lv-urbanos", "3A", "CUP", 15000, ["36"], "Último par talla 36", "active", False, "bombazo_calzado", False),
    (92, "YOL-092", "Bota Táctica Militar Negra Cierre Lateral", "Táctico", "calzado", "botas-tacticas", "Importado", "CUP", 13000, ["42", "45"], "Talla #45 viene reducida (-1 talla)", "active", False, "bombazo_calzado", False),
    (93, "YOL-093", "Air Jordan 1 Mid Chicago Blanco Rojo & Negro", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 20000, ["39"], "Último par talla 39", "active", False, "bombazo_calzado", False),
    (94, "YOL-094", "Air Jordan 4 Red Thunder Piel Negro & Rojo", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 25000, ["42"], "Último par talla 42", "active", False, "bombazo_calzado", False),
    (95, "YOL-095", "Nike Air Force 1 Low Blanco Clásico", "Nike", "calzado", "tenis-nike", "3A", "CUP", 25000, ["40", "41", "42", "43"], "", "active", False, "bombazo_calzado", False),
    (96, "YOL-096", "Air Jordan 4 Pure Money Blanco & Plata", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 25000, ["41"], "Último par talla 41", "active", False, "bombazo_calzado", False),
    (97, "YOL-097", "New Balance 9060 Blanco & Negro Clásico", "New Balance", "calzado", "tenis-new-balance", "3A", "CUP", 30000, ["39", "40"], "", "active", False, "bombazo_calzado", False),
    (98, "YOL-098", "Air Jordan 4 Military Black Blanco & Gris", "Jordan", "calzado", "tenis-jordan", "3A", "CUP", 25000, ["41"], "Último par talla 41", "active", False, "bombazo_calzado", False),
    (99, "YOL-099", "Nike Air Max 97 Plata Metálico", "Nike", "calzado", "tenis-nike", "3A", "CUP", 25000, ["40", "41", "42", "43"], "", "active", False, "bombazo_calzado", False),
    (100, "YOL-100", "Louis Vuitton LV Trainer Blanco & Rojo", "Louis Vuitton", "calzado", "tenis-lv-urbanos", "3A", "CUP", 25000, ["41", "43"], "", "active", True, "bombazo_calzado", False),
    (101, "YOL-101", "Louis Vuitton LV Trainer Rojo & Blanco", "Louis Vuitton", "calzado", "tenis-lv-urbanos", "3A", "CUP", 25000, ["40"], "Último par talla 40", "active", False, "bombazo_calzado", False),
    (102, "YOL-102", "Adidas Campus 00s Rosa Palo Gamuza", "Adidas", "calzado", "tenis-adidas", "3A", "CUP", 25000, ["40"], "Horma reducida (-1 talla)", "active", False, "bombazo_calzado", False),
    (103, "YOL-103", "Louis Vuitton LV Trainer Blanco & Vino", "Louis Vuitton", "calzado", "tenis-lv-urbanos", "3A", "CUP", 25000, ["41", "43"], "", "active", False, "bombazo_calzado", False),

    # --- 03_Wh: Blusas, Tops & Corsets Shein (105..118) ---
    (105, "YOL-105", "Top Halter Acanalado Crema o Lunares", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "Disponible crema y lunares (blanco agotado)", "active", False, "shein_moda", False),
    (106, "YOL-106", "Top Halter Satén Vino con Encaje Asimétrico", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", True, "shein_moda", False),
    (107, "YOL-107", "Top Halter Satén Negro con Encaje", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (108, "YOL-108", "Top Halter Satén Borgoña con Encaje", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (109, "YOL-109", "Top Strapless Negro Herraje Dorado", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (110, "YOL-110", "Blusa Halter Asimétrica Satén Chocolate", "SHEIN PETITE", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (111, "YOL-111", "Top Corset Fruncido Morado", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", True),
    (112, "YOL-112", "Blusa Asimétrica Un Hombro Crema", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (113, "YOL-113", "Top Halter Satén Marrón Chocolate Encaje", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (114, "YOL-114", "Blusa Espalda Descubierta Lunares Crema", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (115, "YOL-115", "Corset Vino Escote Corazón Varillas", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (116, "YOL-116", "Top Satén Blanco Asimétrico Encaje Negro", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["M"], "Disponible en talla M", "active", False, "shein_moda", False),
    (117, "YOL-117", "Corset Negro Encaje Floral Transparente", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", True, "shein_moda", False),
    (118, "YOL-118", "Bustier Champagne Encaje & Perlas", "SHEIN", "moda_shein", "blusas-tops-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),

    # --- 04_Wh: Vestidos Shein (119..155) ---
    (119, "YOL-119", "Vestido Midi Hombros Caídos Café Oscuro", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (120, "YOL-120", "Vestido Mini Drapeado Un Hombro Marfil", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (121, "YOL-121", "Vestido Largo Halter Espalda Descubierta Oliva", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (122, "YOL-122", "Vestido Corto Satén Chocolate con Encaje", "SHEIN PETITE", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", True, "shein_moda", False),
    (123, "YOL-123", "Vestido Dos Piezas Lunares Vino Abertura", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (124, "YOL-124", "Vestido Corto Capas Volantes Marrón", "SHEIN BAE", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (125, "YOL-125", "Vestido Midi Halter Satén Marrón Asimétrico", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (126, "YOL-126", "Vestido Largo Tirantes Marrón Juvenil", "SHEIN Pitira", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["13-16 años", "S"], "Talla juvenil 13-16 años", "active", False, "shein_moda", False),
    (127, "YOL-127", "Vestido Largo Tirantes Negro Ajustado", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (128, "YOL-128", "Vestido Largo Hombros Descubiertos Vino", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (129, "YOL-129", "Vestido Largo Escote V Amarillo Pastel", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["L"], "Disponible en talla L", "active", False, "shein_moda", False),
    (130, "YOL-130", "Vestido Corto Halter Lunares Lazos", "SHEIN PETITE", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (131, "YOL-131", "Vestido Corto Manga Larga Bicolor Negro/Blanco", "SHEIN EZwear", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (132, "YOL-132", "Vestido Largo Drapeado Café con Hebilla", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (133, "YOL-133", "Vestido Largo Cut-Out Hebilla Dorada Vino", "SHEIN Glamine", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "Tela forrada", "active", True, "shein_moda", False),
    (134, "YOL-134", "Vestido Largo Tirantes Azul Marino", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (135, "YOL-135", "Vestido Corto Blanco Cintura Encaje Negro", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (136, "YOL-136", "Vestido Corto Lazos Delanteros Beige", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (137, "YOL-137", "Vestido Midi Cuello Alto Verde Musgo", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (138, "YOL-138", "Vestido Largo Satén Negro Tirantes", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (139, "YOL-139", "Vestido Largo Encaje & Satén Berenjena", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (140, "YOL-140", "Vestido Mini Negro Escote V con Encaje", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", True),
    (141, "YOL-141", "Vestido Midi Strapless Café Transparencias", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (142, "YOL-142", "Vestido Largo Ajustado Beige Arena", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (143, "YOL-143", "Vestido Mini Drapeado Flecos Champagne", "SOLEIA", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (144, "YOL-144", "Vestido Mini Lencero Beige Encaje Negro", "SKYRAZE", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "Forrado interior", "active", False, "shein_moda", False),
    (145, "YOL-145", "Vestido Midi Satén Rojo Escote V", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (146, "YOL-146", "Vestido Corto Cuadros Vichy Rojo & Blanco", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (147, "YOL-147", "Vestido Largo Espalda Descubierta Lazo Rojo", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (148, "YOL-148", "Vestido Corto Halter Marrón Lunares", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (149, "YOL-149", "Vestido Corto Satén Marfil Encaje Negro", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (150, "YOL-150", "Vestido Midi Satén Rojo Asimétrico Encaje", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (151, "YOL-151", "Vestido Mini Halter Negro Lunares", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["M"], "Disponible talla M", "active", False, "shein_moda", False),
    (152, "YOL-152", "Vestido Midi Negro Escote V", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (153, "YOL-153", "Vestido Largo Satén Un Hombro Verde Menta", "Lumalex", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (154, "YOL-154", "Vestido Midi Satén Negro Asimétrico Encaje", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S"], "Disponible talla S", "active", False, "shein_moda", False),
    (155, "YOL-155", "Vestido Largo Halter Amarillo Pastel Volante", "SHEIN", "moda_shein", "vestidos-shein", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),

    # --- 05_Wh & 06_Wh: Conjuntos & Minifaldas Mujer (156..164) ---
    (156, "YOL-156", "Conjunto Lino Beige Top Volantes & Pantalón", "SHEIN", "moda_shein", "conjuntos-mujer", "SHEIN", "USD", None, ["S", "M"], "2 piezas", "active", True, "shein_moda", False),
    (157, "YOL-157", "Conjunto Beige Top Un Hombro & Bermuda", "HAUTURE", "moda_shein", "conjuntos-mujer", "SHEIN", "USD", None, ["S", "M"], "2 piezas", "active", False, "shein_moda", False),
    (158, "YOL-158", "Conjunto Café Top Aro & Falda Larga", "SHEIN BAE", "moda_shein", "conjuntos-mujer", "SHEIN", "USD", None, ["S", "M"], "2 piezas", "active", False, "shein_moda", False),
    (159, "YOL-159", "Conjunto Negro Chaleco Estrella & Minifalda", "SHEIN", "moda_shein", "conjuntos-mujer", "SHEIN", "USD", None, ["S", "M"], "2 piezas", "active", False, "shein_moda", False),
    (160, "YOL-160", "Conjunto Borgoña Top Encaje & Falda Larga", "SHEIN", "moda_shein", "conjuntos-mujer", "SHEIN", "USD", None, ["M"], "Disponible talla M", "active", False, "shein_moda", False),
    (161, "YOL-161", "Conjunto Punto Café Cárdigan Lazos & Falda", "SHEIN", "moda_shein", "conjuntos-mujer", "SHEIN", "USD", None, ["S", "M"], "2 piezas", "active", False, "shein_moda", False),
    (162, "YOL-162", "Conjunto Casual Rosado Top & Pantalón", "SHEIN", "moda_shein", "conjuntos-mujer", "SHEIN", "USD", None, ["S", "M"], "2 piezas", "active", False, "shein_moda", False),
    (163, "YOL-163", "Minifalda Lentejuelas Plateada", "SHEIN", "moda_shein", "conjuntos-mujer", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (164, "YOL-164", "Minifalda Lentejuelas Rojo Vino", "SHEIN", "moda_shein", "conjuntos-mujer", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),

    # --- 07_Wh: Carteras & Bolsos (165..166) ---
    (165, "YOL-165", "Cartera de Hombro Charol Rojo Vino", "NOBLEVUE", "accesorios", "bolsos-relojes", "Importado", "USD", None, ["Única"], "", "active", False, "shein_moda", False),
    (166, "YOL-166", "Bolso de Hombro Negro Doble Hebilla", "ModPU", "accesorios", "bolsos-relojes", "Importado", "USD", None, ["Única"], "", "active", False, "shein_moda", False),

    # --- 08_Wh & 09_Wh: Enterizos, Rompers & Leggings (167..182) ---
    (167, "YOL-167", "Enterizo Deportivo Largo Un Hombro Negro", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "Efecto compresión Tummy Control", "active", False, "shein_moda", False),
    (168, "YOL-168", "Romper Corto Escote Cuadrado Café", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (169, "YOL-169", "Romper Corto Escote Cuadrado Blanco", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (170, "YOL-170", "Enterizo Largo Deportivo Espalda Abierta", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (171, "YOL-171", "Enterizo Largo Negro Espalda Descubierta", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (172, "YOL-172", "Romper Deportivo Corto Espalda Cruzada Ciruela", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (173, "YOL-173", "Romper Corto Deportivo Rojo Vino", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (174, "YOL-174", "Romper Corto Básico Negro", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (175, "YOL-175", "Enterizo Deportivo Largo Negro o Rojo", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", True),
    (176, "YOL-176", "Enterizo Largo Lazos Cut-Out Negro", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "Disponible en color negro", "active", False, "shein_moda", False),
    (177, "YOL-177", "Pack Leggings Tie-Dye Terracota & Azul", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "Agotado temporalmente", "sold_out", False, "shein_moda", False),
    (178, "YOL-178", "Legging Deportivo Push-Up Tie-Dye Azul", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (179, "YOL-179", "Pack Leggings Leopardo & Negro", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "Agotado temporalmente", "sold_out", False, "shein_moda", False),
    (180, "YOL-180", "Legging Push-Up Azul Rey", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),
    (181, "YOL-181", "Legging Deportivo Curve Tie-Dye Marino", "SHEIN Curve", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["M", "L"], "", "active", False, "shein_moda", False),
    (182, "YOL-182", "Legging Tie-Dye Blanco & Negro", "SHEIN", "moda_shein", "enterizos-leggings", "SHEIN", "USD", None, ["S", "M"], "", "active", False, "shein_moda", False),

    # --- 10_Wh, 11_Wh & tienda02 #221: Zuecos, Sandalias & Tacones Mujer (183..193, 221) ---
    (183, "YOL-183", "Zueco Mujer Suede Crema Hebilla Corcho", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["38"], "Disponible talla 38", "active", False, "shein_moda", False),
    (184, "YOL-184", "Zueco Mujer Beige Claro Suela Corcho", "SOLECIA", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["36", "37"], "Talla 36-37", "active", False, "shein_moda", False),
    (185, "YOL-185", "Zueco Mujer Arena Hebilla Dorada", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["39", "40"], "Talla 39-40", "active", False, "shein_moda", False),
    (186, "YOL-186", "Sandalia Negra Tacón Cuadrado Clásica", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["37"], "Disponible talla 37", "active", False, "shein_moda", False),
    (187, "YOL-187", "Sandalia Plana Marrón Peluche Crema", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["38", "39"], "Disponible talla 38 y 39", "active", False, "shein_moda", False),
    (188, "YOL-188", "Sandalia Tacón Medio Negra Charol", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["38"], "Disponible talla 38", "active", False, "shein_moda", False),
    (189, "YOL-189", "Sandalia Tacón Marrón Detalle Animal Print", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["39"], "Disponible talla 39", "active", False, "shein_moda", False),
    (190, "YOL-190", "Sandalia Tacón Bajo Negra Minimalista", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["38"], "Disponible talla 38", "active", False, "shein_moda", False),
    (191, "YOL-191", "Sandalia Tacón Alto Tiras Cruzadas Negra", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["Consultar"], "", "active", False, "shein_moda", False),
    (192, "YOL-192", "Sandalia Tacón Bajo Beige Nude", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["37"], "Disponible talla 37", "active", False, "shein_moda", False),
    (193, "YOL-193", "Tacón Slingback Lazo Marrón Chocolate", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["39"], "Disponible talla 39", "active", False, "shein_moda", False),
    (221, "YOL-221", "Sandalia Plataforma Doble Hebilla Negra", "SHEIN", "calzado", "zuecos-sandalias", "Importado", "USD", None, ["40", "41"], "Talla 40-41", "active", False, "tienda02_loose", False),

    # --- 12_Wh..15_Wh & tienda02 #222,#223: Moda Hombre (194..215, 222..223) ---
    (194, "YOL-194", "Sudadera Hoodie Jaspeada Gris Claro", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["M", "L"], "Talla M-L", "active", False, "shein_moda", False),
    (195, "YOL-195", "Sudadera Hoodie Térmica Blanca", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["M", "L"], "Interior afelpado · Talla M-L", "active", False, "shein_moda", False),
    (196, "YOL-196", "Sudadera Hoodie Negra Clásica", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["M", "L"], "Talla M-L", "active", False, "shein_moda", False),
    (197, "YOL-197", "Sudadera Hoodie Café Osito Bordado", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["M", "L"], "Talla M-L", "active", True, "shein_moda", False),
    (198, "YOL-198", "Sudadera Hoodie Acid Wash Negro Estampado", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["L"], "Disponible talla L", "active", False, "shein_moda", False),
    (199, "YOL-199", "Conjunto Hombre NY Crema & Café (2 Pzs)", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["XL", "XXL"], "Tallas XL y XXL", "active", False, "shein_moda", False),
    (200, "YOL-200", "Conjunto Hombre Sin Mangas Lavado Oscuro", "GRDR", "hombre", "moda-hombre", "Importado", "USD", None, ["M"], "Disponible talla M", "active", False, "shein_moda", False),
    (201, "YOL-201", "Conjunto Hombre Sin Mangas Gris Claro", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["XL", "XXL"], "Tallas XL y XXL", "active", False, "shein_moda", False),
    (202, "YOL-202", "Conjunto Hombre NY Gris & Negro (2 Pzs)", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["L"], "Disponible talla L", "active", False, "shein_moda", False),
    (203, "YOL-203", "Short Denim Negro Lavado Estrellas Strass", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["32"], "Disponible talla 32", "active", False, "shein_moda", False),
    (204, "YOL-204", "Jean Baggy Azul Claro Estrellas", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["M"], "Disponible talla M", "active", False, "shein_moda", False),
    (205, "YOL-205", "Bermudas Denim Gris Estrellas", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["M"], "Disponible talla M", "active", False, "shein_moda", False),
    (206, "YOL-206", "Camiseta Oversize LA Beige Arena", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["L", "XL"], "Tallas L y XL", "active", False, "shein_moda", True),
    (207, "YOL-207", "Camiseta Negra Speak No Evil", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["L"], "Disponible talla L", "active", False, "shein_moda", True),
    (208, "YOL-208", "Camiseta Negra The World Is Yours", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["L"], "Disponible talla L", "active", False, "shein_moda", False),
    (209, "YOL-209", "Camiseta Blanca Oversize Escultura Clásica", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["L", "XL"], "", "active", False, "shein_moda", False),
    (210, "YOL-210", "Camiseta Sin Mangas Colombia Amarilla", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["L"], "Disponible talla L", "active", False, "shein_moda", True),
    (211, "YOL-211", "Camiseta Sin Mangas Blanca Faith Over Fear", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["L"], "Disponible talla L", "active", False, "shein_moda", False),
    (212, "YOL-212", "Jersey Deportivo Pampas FC 10 Celeste", "Pampas FC", "hombre", "moda-hombre", "Importado", "USD", None, ["L"], "Disponible talla L", "active", False, "shein_moda", False),
    (213, "YOL-213", "Chaleco Acid Wash Negro Cruces Strass", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["L"], "Disponible talla L", "active", False, "shein_moda", False),
    (214, "YOL-214", "Camiseta Negra Estatua Libertad FUTRZY", "FUTRZY", "hombre", "moda-hombre", "Importado", "USD", None, ["XL"], "Disponible talla XL", "active", False, "shein_moda", False),
    (215, "YOL-215", "Camisa Manga Corta Textura Rayas Celeste", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["M", "L"], "", "active", False, "shein_moda", False),
    (222, "YOL-222", "Pantalón Cargo Negro Gráfico Tribal", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["M", "L"], "", "active", False, "tienda02_loose", False),
    (223, "YOL-223", "Conjunto Jogger & Hoodie Gris Gráfico", "SHEIN", "hombre", "moda-hombre", "Importado", "USD", None, ["M", "L"], "Disponible talla M y L", "active", True, "tienda02_loose", False),

    # --- 16_Wh: Relojes (216..218) ---
    (216, "YOL-216", "Reloj Casio Análogo Esfera Azul Acero", "Casio", "accesorios", "bolsos-relojes", "Importado", "USD", None, ["Única"], "", "active", False, "shein_moda", True),
    (217, "YOL-217", "Reloj Olevs Cronógrafo Azul Acero Inox", "Olevs", "accesorios", "bolsos-relojes", "Importado", "USD", None, ["Única"], "", "active", True, "shein_moda", False),
    (218, "YOL-218", "Reloj Casio Illuminator Digital Vintage Acero", "Casio", "accesorios", "bolsos-relojes", "Importado", "USD", None, ["Única"], "", "active", False, "shein_moda", True),
]


def load_manifest():
    m = {}
    with open(MANIFEST_PATH, encoding="utf-8") as f:
        for line in f:
            idx, md5, rel = line.strip().split("\t")
            m[int(idx)] = Path("/tmp/tienda_analisis") / rel
    return m


def smart_trim_dark_bars(im: Image.Image) -> Image.Image:
    """Recorta barras negras/oscuras uniformes de capturas de pantalla móvil (arriba/abajo/lados)."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    px = rgb.load()

    def row_is_dark(y):
        samples = [px[x, y] for x in range(0, w, max(1, w // 24))]
        return all(r < 24 and g < 24 and b < 28 for (r, g, b) in samples)

    def col_is_dark(x):
        samples = [px[x, y] for y in range(0, h, max(1, h // 24))]
        return all(r < 24 and g < 24 and b < 28 for (r, g, b) in samples)

    top = 0
    while top < h * 0.25 and row_is_dark(top):
        top += 1
    bottom = h - 1
    while bottom > h * 0.72 and row_is_dark(bottom):
        bottom -= 1
    left = 0
    while left < w * 0.25 and col_is_dark(left):
        left += 1
    right = w - 1
    while right > w * 0.75 and col_is_dark(right):
        right -= 1

    # Also trim Google mobile app browser top bar (~14% top if very dark header) for #111 / #140 / #175
    if (bottom - top) > h * 0.45 and (right - left) > w * 0.45:
        return rgb.crop((left, top, right + 1, bottom + 1))
    return rgb


def optimize_image(src_path: Path, sku: str, trim_bars: bool) -> Path:
    WEBP_DIR.mkdir(parents=True, exist_ok=True)
    out_path = WEBP_DIR / f"{sku}.webp"
    im = ImageOps.exif_transpose(Image.open(src_path))
    if trim_bars:
        im = smart_trim_dark_bars(im)
        # Specific tight UI crop on #111 (Google search overlay) & #140 (SHEIN overlay)
        if sku == "YOL-111":
            w, h = im.size
            im = im.crop((int(w * 0.04), int(h * 0.14), int(w * 0.96), int(h * 0.74)))
        elif sku == "YOL-140":
            w, h = im.size
            im = im.crop((int(w * 0.06), int(h * 0.09), int(w * 0.94), int(h * 0.80)))
    else:
        im = im.convert("RGB")

    # Max dimension 1200px without upscaling, high-quality WebP (86%)
    if max(im.size) > 1200:
        im.thumbnail((1200, 1200), Image.Resampling.LANCZOS)
    im.save(out_path, "WEBP", quality=86, method=6)
    return out_path


def upload_webp(item):
    sku, webp_path = item
    storage_path = f"catalog/{sku}.webp"
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{storage_path}"
    data = webp_path.read_bytes()
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "image/webp",
            "x-upsert": "true",
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        if resp.status not in (200, 201):
            raise RuntimeError(f"Upload failed {sku}: {resp.status}")
    return sku, storage_path, len(data)


def upsert_products(rows):
    url = f"{SUPABASE_URL}/rest/v1/products?on_conflict=sku"
    # Upsert in chunks of 50
    for i in range(0, len(rows), 50):
        batch = rows[i:i+50]
        body = json.dumps(batch).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "apikey": SERVICE_KEY,
                "Authorization": f"Bearer {SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status not in (200, 201, 204):
                raise RuntimeError(f"Upsert failed batch {i}: {resp.status}")


def main():
    manifest = load_manifest()
    total_orig = 0
    total_webp = 0
    to_upload = []
    db_rows = []

    for sort_i, entry in enumerate(CATALOG):
        idx, sku, title, brand, dept, cat, quality, curr, price, sizes, fit_note, status, featured, src_group, trim = entry
        src_path = manifest[idx]
        total_orig += src_path.stat().st_size
        webp_path = optimize_image(src_path, sku, trim)
        total_webp += webp_path.stat().st_size
        to_upload.append((sku, webp_path))

        storage_path = f"catalog/{sku}.webp"
        public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{storage_path}"
        db_rows.append({
            "sku": sku,
            "title": title,
            "brand": brand,
            "department": dept,
            "category_id": cat,
            "quality": quality,
            "currency": curr,
            "cost_price": price,
            "price": price,
            "sizes": sizes,
            "fit_note": fit_note,
            "image_url": public_url,
            "image_path": storage_path,
            "status": status,
            "featured": featured,
            "source_group": src_group,
            "sort_order": (sort_i + 1) * 10,
        })

    print(f"Optimized {len(to_upload)} images: {total_orig/1024/1024:.2f} MB -> {total_webp/1024/1024:.2f} MB WebP ({100*(1-total_webp/total_orig):.1f}% savings)")

    uploaded = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        for sku, sp, sz in ex.map(upload_webp, to_upload):
            uploaded += 1
            if uploaded % 40 == 0 or uploaded == len(to_upload):
                print(f"Uploaded {uploaded}/{len(to_upload)} images...")

    upsert_products(db_rows)
    print(f"Upserted {len(db_rows)} products into public.products!")


if __name__ == "__main__":
    main()
