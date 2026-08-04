/* ============================================================
   CinePulse — Configuration TMDB
   ============================================================
   IMPORTANT : Pour utiliser l'API TMDB, vous devez obtenir une
   clé (v3) gratuite sur https://www.themoviedb.org/settings/api
   puis la coller ci-dessous dans TMDB_API_KEY.

   Vous pouvez aussi définir la clé via une variable globale
   window.TMDB_API_KEY avant le chargement de ce script, ou via
   localStorage.setItem('cinepulse_tmdb_key', 'VOTRE_CLE').
   ============================================================ */

(function (global) {
  'use strict';

  // -----------------------------------------------------------
  // Clé d'API TMDB (v3).
  //
  // Pour tester CinePulse SANS configurer de clé personnelle,
  // la valeur ci-dessous est laissée vide — vous verrez alors
  // l'état "erreur" + le bouton "Réessayer" sur chaque section,
  // ce qui prouve la robustesse de l'app.
  //
  // ⚠ En production, mettez votre clé personnelle ici :
  //     TMDB_API_KEY = 'xxxxxxxxxxxxxxxxxxxxxxxxxx';
  //
  // ⚠ Ne commitez JAMAIS votre vraie clé sur un dépôt public.
  // -----------------------------------------------------------
  // ⚠ Clé de démonstration publique TMDB v3 (fournie à titre d'exemple).
  //   Remplacez-la par votre clé personnelle gratuite obtenue sur
  //   https://www.themoviedb.org/settings/api pour une utilisation en production.
  const DEFAULT_DEMO_KEY = '2696829a81b1b5827d515ff121700838';

  // Lecture avec ordre de priorité :
  //   1. window.TMDB_API_KEY (défini en amont)
  //   2. localStorage('cinepulse_tmdb_key')
  //   3. DEFAULT_DEMO_KEY (vide par défaut)
  function resolveApiKey() {
    if (global.TMDB_API_KEY && typeof global.TMDB_API_KEY === 'string') {
      return global.TMDB_API_KEY.trim();
    }
    try {
      const stored = global.localStorage && global.localStorage.getItem('cinepulse_tmdb_key');
      if (stored && stored.trim()) return stored.trim();
    } catch (e) { /* localStorage indisponible */ }
    return DEFAULT_DEMO_KEY;
  }

  global.CINEPULSE_CONFIG = {
    API_KEY: resolveApiKey(),
    BASE_URL: 'https://api.themoviedb.org/3',
    IMG_BASE_URL: 'https://image.tmdb.org/t/p',
    LANG: 'fr-FR',
    REGION: 'FR',
    TIMEOUT_MS: 10000,             // 10 secondes (AbortController)
    MAX_RETRIES: 1,                // 1 retry automatique en cas d'échec réseau
    POSTER_SIZE: 'w342',
    BACKDROP_SIZE: 'w780'
  };
})(typeof window !== 'undefined' ? window : globalThis);
