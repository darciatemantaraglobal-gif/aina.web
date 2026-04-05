/**
 * Google Places API integration for AINA
 *
 * Detects place/location queries in Indonesian and English,
 * calls Google Places API (new), and returns a rich context block
 * that gets injected into the AINA system prompt.
 *
 * Flow:
 *   detectPlacesQuery(text)        → true/false
 *   extractPlaceSearchTerm(text)   → { query, intent, nearby }
 *   searchPlaces(query, options)   → { places, nearbyPlaces }
 *   buildPlacesContext(text)       → context string for system prompt
 */

const GMAPS_API = "https://places.googleapis.com/v1/places";
// Default search centre: Hay Asyir / Nasr City Cairo — heart of Masisir community
const MASISIR_LAT = 30.0659;
const MASISIR_LNG = 31.3338;

/* ── Query intent categories ─────────────────────────────── */
const PLACE_PATTERNS = [
  // Asking for a specific named place
  { re: /\b(di\s*mana|dimana|alamat|lokasi|letak|tempat|adres|where\s*is|where\s*to\s*find)\b.{0,80}\b(\w{3,})/i, intent: "find_place" },
  // Looking for type of place: restaurant, clinic, bank, etc.
  { re: /\b(cari|ada\s*(ga|gak|tidak|nggak)?|rekomen(dasi)?|rekomendasi|suggest|recommend|mana\s*(yang|yg)\s*(enak|bagus|deket|dekat|terdekat|murah))\b.{0,60}\b(resto(ran)?|kafe|cafe|warung|kantin|makan|kuliner|klinik|apotek|apotik|bank|atm|supermarket|market|toko|masjid|musholla|gym|salon|barbershop|fotokopi|print|laundry|hotel|kos|bensin|spbu|rumah\s*sakit|rs\b|dokter)/i, intent: "find_nearby" },
  // Direct "near me" / "terdekat" queries
  { re: /\b(terdekat|paling\s*deket|near\s*me|nearby|di\s*sekitar|deket\s*sini|sekitaran)\b/i, intent: "find_nearby" },
  // Specific Egyptian place types
  { re: /\b(masjid|musholla|mesajid|mosque|universitas|kampus|al.azhar|azhar|mansoura|tanta|iskandaria|alexandria|rasyid|rashid|luxor|aswan|sinai)\b/i, intent: "find_place" },
  // info about a place
  { re: /\b(jam\s*buka|jam\s*operasional|tutup\s*jam|open\s*hour|nomor\s*(telpon|telepon|hp|wa|phone)|kontak|email\s*(tempat|resto|klinik)|rating|review|ulasan)\b.{0,80}/i, intent: "place_info" },
  // Cairo-specific areas to distinguish from general queries
  { re: /\b(nasr\s*city|hay\s*asyir|maadi|zamalek|downtown\s*cairo|heliopolis|dokki|mohandessin|giza|shubra|darrasah|hussein|khan\s*khalili)\b/i, intent: "find_place" },
];

const NEARBY_TYPE_MAP = {
  "resto": "restaurant", "restoran": "restaurant", "restaurant": "restaurant",
  "kafe": "cafe", "cafe": "cafe", "coffee": "cafe",
  "warung": "restaurant", "kantin": "restaurant",
  "makan": "restaurant", "kuliner": "restaurant",
  "klinik": "doctor", "dokter": "doctor", "clinic": "doctor",
  "apotek": "pharmacy", "apotik": "pharmacy", "pharmacy": "pharmacy",
  "bank": "bank", "atm": "atm",
  "supermarket": "supermarket", "market": "supermarket", "toko": "store",
  "masjid": "mosque", "musholla": "mosque", "mosque": "mosque",
  "gym": "gym", "fitness": "gym",
  "salon": "beauty_salon", "barbershop": "hair_care",
  "laundry": "laundry",
  "hotel": "lodging", "kos": "lodging",
  "spbu": "gas_station", "bensin": "gas_station", "pom\s*bensin": "gas_station",
  "rumah sakit": "hospital", "rs": "hospital", "hospital": "hospital",
  "fotokopi": "copy_center", "print": "copy_center",
};

/* ── Detect if query needs places lookup ─────────────────────── */
export function detectPlacesQuery(text) {
  if (!process.env.GOOGLE_MAPS_API_KEY) return false;
  const t = text;
  for (const { re } of PLACE_PATTERNS) {
    if (re.test(t)) return true;
  }
  return false;
}

/* ── Extract search term and intent from query text ───────── */
export function extractPlaceSearchTerm(text) {
  const t = text;

  // Detect intent
  let intent = "find_place";
  for (const { re, intent: i } of PLACE_PATTERNS) {
    if (re.test(t)) { intent = i; break; }
  }

  // Try to extract specific place name (after "dimana", "lokasi", "cari", etc.)
  const namedPlaceMatch = t.match(
    /(?:di\s*mana|dimana|lokasi|alamat|cari|tempat|where\s*is)\s+(?:tempat\s+)?(?:yang\s+)?(.{3,60}?)(?:\?|$|\n|,|\.)/i
  );

  // Detect nearby type
  let nearbyType = null;
  for (const [key, val] of Object.entries(NEARBY_TYPE_MAP)) {
    if (new RegExp("\\b" + key + "\\b", "i").test(t)) {
      nearbyType = val;
      break;
    }
  }

  // Extract area/neighborhood reference
  const areaMatch = t.match(
    /\b(nasr\s*city|hay\s*asyir|hay\s*'asher|maadi|zamalek|heliopolis|dokki|mohandessin|giza|shubra|darrasah|downtown|khalifa|roda|manial|imbaba|agouza)\b/i
  );
  const area = areaMatch ? areaMatch[0] : null;

  // Build the actual search query
  let query = namedPlaceMatch ? namedPlaceMatch[1].trim() : null;
  if (!query && nearbyType) {
    query = nearbyType + " " + (area || "Nasr City Cairo Indonesia");
  }
  if (!query) {
    // Fallback: extract longest noun phrase
    const nouns = t.match(/[A-Z][A-Za-z\s]{2,40}/g);
    query = nouns ? nouns[0].trim() : t.slice(0, 60);
  }
  // Always anchor to Cairo / Egypt
  if (!query.toLowerCase().includes("cairo") && !query.toLowerCase().includes("kairo") && !query.toLowerCase().includes("mesir") && !query.toLowerCase().includes("egypt")) {
    query += " Cairo Egypt";
  }

  return { query, intent, nearbyType, area };
}

/* ── Call Google Places Text Search (New) ────────────────── */
async function textSearchPlaces(query) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  try {
    const body = {
      textQuery: query,
      maxResultCount: 5,
      languageCode: "id",
      locationBias: {
        circle: {
          center: { latitude: MASISIR_LAT, longitude: MASISIR_LNG },
          radius: 20000, // 20km radius around Nasr City
        },
      },
    };

    const res = await fetch(`${GMAPS_API}:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "places.displayName",
          "places.formattedAddress",
          "places.internationalPhoneNumber",
          "places.nationalPhoneNumber",
          "places.regularOpeningHours",
          "places.rating",
          "places.userRatingCount",
          "places.websiteUri",
          "places.location",
          "places.googleMapsUri",
          "places.types",
          "places.primaryTypeDisplayName",
          "places.editorialSummary",
          "places.businessStatus",
        ].join(","),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn("[Places] textSearch error:", res.status, err.slice(0, 200));
      return [];
    }

    const data = await res.json();
    return data.places || [];
  } catch (e) {
    console.warn("[Places] textSearch exception:", e.message);
    return [];
  }
}

/* ── Call Google Places Nearby Search ────────────────────── */
async function nearbySearchPlaces(type, lat = MASISIR_LAT, lng = MASISIR_LNG, radius = 1500) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return [];

  try {
    const body = {
      includedTypes: [type],
      maxResultCount: 5,
      languageCode: "id",
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius,
        },
      },
    };

    const res = await fetch(`${GMAPS_API}:searchNearby`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": [
          "places.displayName",
          "places.formattedAddress",
          "places.internationalPhoneNumber",
          "places.rating",
          "places.userRatingCount",
          "places.regularOpeningHours",
          "places.googleMapsUri",
          "places.businessStatus",
        ].join(","),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const err = await res.text();
      console.warn("[Places] nearbySearch error:", res.status, err.slice(0, 200));
      return [];
    }

    const data = await res.json();
    return data.places || [];
  } catch (e) {
    console.warn("[Places] nearbySearch exception:", e.message);
    return [];
  }
}

/* ── Format a single place for the context block ────────── */
function formatPlace(place, index) {
  const name    = place.displayName?.text || "Nama tidak tersedia";
  const address = place.formattedAddress || "Alamat tidak tersedia";
  const phone   = place.internationalPhoneNumber || place.nationalPhoneNumber || null;
  const website = place.websiteUri || null;
  const maps    = place.googleMapsUri || null;
  const rating  = place.rating ? `⭐ ${place.rating}/5 (${place.userRatingCount || 0} ulasan)` : null;
  const summary = place.editorialSummary?.text || null;
  const status  = place.businessStatus;

  // Opening hours
  let hours = null;
  const oh = place.regularOpeningHours;
  if (oh) {
    if (oh.openNow === true)  hours = "🟢 Buka sekarang";
    if (oh.openNow === false) hours = "🔴 Tutup sekarang";
    if (oh.weekdayDescriptions?.length) {
      const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
      const todayLine = oh.weekdayDescriptions.find(d => d.startsWith(today));
      if (todayLine) hours = (hours ? hours + " · " : "") + todayLine;
      else hours = (hours ? hours + " | " : "") + "Jam buka: " + oh.weekdayDescriptions.slice(0, 3).join("; ");
    }
  }

  const lines = [`${index}. **${name}**`];
  if (status === "CLOSED_PERMANENTLY") lines.push("   ⚠️ Tempat ini sudah TUTUP PERMANEN");
  if (summary) lines.push(`   ${summary}`);
  lines.push(`   📍 ${address}`);
  if (phone)   lines.push(`   📞 ${phone}`);
  if (website) lines.push(`   🌐 ${website}`);
  if (rating)  lines.push(`   ${rating}`);
  if (hours)   lines.push(`   🕐 ${hours}`);
  if (maps)    lines.push(`   🗺️ [Buka Maps](${maps})`);

  return lines.join("\n");
}

/* ── Main: build context block for system prompt injection ── */
export async function buildPlacesContext(userText) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;

  try {
    const { query, intent, nearbyType, area } = extractPlaceSearchTerm(userText);
    console.log(`[Places] query="${query}" intent=${intent} nearbyType=${nearbyType || "none"} area=${area || "default"}`);

    let places = [];
    let nearbyPlaces = [];

    // Run text search for the main query
    places = await textSearchPlaces(query);

    // If intent is "find_nearby" and we have a type, also run nearby search
    if (intent === "find_nearby" && nearbyType && places.length > 0) {
      const firstLoc = places[0]?.location;
      if (firstLoc) {
        nearbyPlaces = await nearbySearchPlaces(nearbyType, firstLoc.latitude, firstLoc.longitude, 1000);
      }
    } else if (intent === "find_nearby" && nearbyType && places.length === 0) {
      nearbyPlaces = await nearbySearchPlaces(nearbyType);
    }

    // Deduplicate by name
    const allNames = new Set(places.map(p => p.displayName?.text));
    nearbyPlaces = nearbyPlaces.filter(p => !allNames.has(p.displayName?.text));

    if (places.length === 0 && nearbyPlaces.length === 0) {
      console.log("[Places] no results found");
      return null;
    }

    // Build context
    const lines = [
      "\n\n---",
      "## 📍 Data Real-Time Google Maps",
      "Berikut data ASLI dari Google Maps untuk query ini. Gunakan data ini sebagai sumber utama — lebih akurat dari pengetahuan training kamu.",
      "**Aturan WAJIB:**",
      "- Sebutkan nama, alamat, dan nomor telepon jika ada",
      "- Sebutkan jam buka jika ada (buka/tutup sekarang)",
      "- Cantumkan link Google Maps jika tersedia",
      "- Jika ada 2+ pilihan, beri daftar dengan ringkasan singkat tiap tempat",
      "- Jangan karang info yang tidak ada di data di bawah ini",
      "",
    ];

    if (places.length > 0) {
      lines.push("### Hasil Pencarian:");
      places.slice(0, 4).forEach((p, i) => lines.push(formatPlace(p, i + 1)));
    }

    if (nearbyPlaces.length > 0) {
      lines.push("\n### Tempat Terdekat Lainnya:");
      nearbyPlaces.slice(0, 3).forEach((p, i) => lines.push(formatPlace(p, i + 1)));
    }

    lines.push("---");
    const ctx = lines.join("\n");
    console.log(`[Places] ✓ context built (${places.length} main + ${nearbyPlaces.length} nearby, ${ctx.length} chars)`);
    return ctx;

  } catch (e) {
    console.warn("[Places] buildPlacesContext error:", e.message);
    return null;
  }
}
