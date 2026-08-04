/* ============================================================
   CinePulse — Module d'appel API TMDB (robuste)
   ============================================================
   - fetch avec timeout via AbortController (10s)
   - try/catch sur chaque appel
   - vérification du status HTTP (lève une erreur détaillée)
   - retry automatique 1 fois en cas d'échec réseau
   - fonction utilitaire commune `tmdbFetch` pour éviter la duplication
   ============================================================ */

(function (global) {
  'use strict';

  const CFG = global.CINEPULSE_CONFIG;

  // ---------- helpers ----------
  function buildUrl(path, params) {
    const url = new URL(CFG.BASE_URL + path);
    if (!CFG.API_KEY) {
      // Erreur claire et immédiate si aucune clé n'est définie.
      throw new Error('Clé API TMDB manquante — renseignez js/config.js (TMDB_API_KEY).');
    }
    url.searchParams.set('api_key', CFG.API_KEY);
    url.searchParams.set('language', CFG.LANG);
    if (params && typeof params === 'object') {
      for (const k in params) {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          url.searchParams.set(k, params[k]);
        }
      }
    }
    return url.toString();
  }

  function posterUrl(path, size) {
    if (!path) return '';
    return CFG.IMG_BASE_URL + '/' + (size || CFG.POSTER_SIZE) + path;
  }

  function backdropUrl(path, size) {
    if (!path) return '';
    return CFG.IMG_BASE_URL + '/' + (size || CFG.BACKDROP_SIZE) + path;
  }

  // ---------- fonction utilitaire commune (UNIQUE point d'appel HTTP) ----------
  /**
   * Effectue un GET sur l'API TMDB avec :
   *   - timeout via AbortController (CFG.TIMEOUT_MS)
   *   - retry automatique 1 fois sur erreur réseau / timeout
   *   - levée d'erreur si !res.ok avec status_code + message TMDB
   */
  async function tmdbFetch(path, params) {
    const url = buildUrl(path, params);

    let lastErr;
    for (let attempt = 0; attempt <= CFG.MAX_RETRIES; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CFG.TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: controller.signal });
        clearTimeout(timer);

        // Vérification du status HTTP
        if (!res.ok) {
          let detail = '';
          try {
            const body = await res.json();
            detail = body.status_message || body.message || JSON.stringify(body);
          } catch (_) { /* pas du JSON */ }
          const err = new Error('HTTP ' + res.status + (detail ? ' — ' + detail : ''));
          err.status = res.status;
          err.path = path;
          // Pas de retry sur 4xx (sauf 408 / 429)
          if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
            throw err;
          }
          lastErr = err;
          continue; // retry pour 5xx / 408 / 429
        }

        // Succès
        return await res.json();
      } catch (err) {
        clearTimeout(timer);
        // Erreur d'abort (timeout) ou erreur réseau
        if (err && err.status && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
          // 4xx non-retryable → remonter immédiatement
          throw err;
        }
        if (err && err.name === 'AbortError') {
          lastErr = new Error('Délai dépassé (' + CFG.TIMEOUT_MS + 'ms) pour ' + path);
        } else {
          lastErr = err instanceof Error ? err : new Error(String(err));
        }
        // dernier essai → on remonte l'erreur
        if (attempt === CFG.MAX_RETRIES) throw lastErr;
        // sinon on attend un court instant avant de retenter
        await new Promise(r => setTimeout(r, 400));
      }
    }
    throw lastErr || new Error('Échec inconnu pour ' + path);
  }

  // ---------- Endpoints TMDB utilisés (12) ----------
  // 1. /movie/now_playing
  // 2. /movie/upcoming
  // 3. /movie/popular (tendances films)
  // 4. /movie/top_rated (cinéma du monde — pool large)
  // 5. /discover/movie (cinéma du monde — filtrable par région/langue)
  // 6. /trending/all/week (accueil tendances)
  // 7. /tv/airing_today (calendrier du jour)
  // 8. /tv/on_the_air (séries en cours)
  // 9. /tv/popular (nouveautés populaires)
  // 10. /trending/tv/week
  // 11. /discover/tv (séries du monde)
  // 12. /configuration (optionnel, pour valider la clé)

  const endpoints = {
    movies: {
      nowPlaying:    () => tmdbFetch('/movie/now_playing',    { region: CFG.REGION, page: 1 }),
      upcoming:      () => tmdbFetch('/movie/upcoming',      { region: CFG.REGION, page: 1 }),
      popular:       () => tmdbFetch('/movie/popular',       { region: CFG.REGION, page: 1 }),
      topRated:      () => tmdbFetch('/movie/top_rated',     { region: CFG.REGION, page: 1 }),
      discoverByOrigin: (originCountry, page) =>
        tmdbFetch('/discover/movie', {
          with_origin_country: originCountry || undefined,
          sort_by: 'popularity.desc',
          page: page || 1,
          'vote_count.gte': 5
        })
    },
    tv: {
      airingToday:   () => tmdbFetch('/tv/airing_today',     { page: 1 }),
      onTheAir:      () => tmdbFetch('/tv/on_the_air',       { page: 1 }),
      popular:       () => tmdbFetch('/tv/popular',          { page: 1 }),
      discoverByOrigin: (originCountry, page) =>
        tmdbFetch('/discover/tv', {
          with_origin_country: originCountry || undefined,
          sort_by: 'popularity.desc',
          page: page || 1,
          'vote_count.gte': 5
        }),
      // Calendrier hebdomadaire : agrège airing_today + on_the_air puis
      // filtre par date de diffusion sur 7 jours glissants.
      weekCalendar: async function () {
        const today = await tmdbFetch('/tv/airing_today', { page: 1 });
        const onAir = await tmdbFetch('/tv/on_the_air',   { page: 1 });
        return { today: today.results || [], onAir: onAir.results || [] };
      }
    },
    misc: {
      trendingAllWeek: () => tmdbFetch('/trending/all/week'),
      configuration:   () => tmdbFetch('/configuration')
    }
  };

  global.CinePulseAPI = {
    tmdbFetch,
    buildUrl,
    posterUrl,
    backdropUrl,
    endpoints
  };
})(typeof window !== 'undefined' ? window : globalThis);
