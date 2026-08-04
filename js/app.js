/* ============================================================
   CinePulse — Logique d'affichage
   ============================================================
   - Spinner de chargement par section
   - État d'erreur (message + bouton "Réessayer") par section
   - État vide par section
   ============================================================ */

(function () {
  'use strict';

  const API = window.CinePulseAPI;
  const CFG = window.CINEPULSE_CONFIG;

  // ---------- helpers DOM ----------
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- États de section ----------
  function showLoading(container, msg) {
    if (!container) return;
    container.innerHTML =
      '<div class="loading-msg" role="status" aria-live="polite">' +
        '<span class="loading-spinner" aria-hidden="true"></span> ' +
        esc(msg || 'Chargement…') +
      '</div>';
  }

  function showError(container, err, onRetry) {
    if (!container) return;
    const detail = (err && (err.message || err.toString())) || 'Erreur inconnue';
    const retryId = 'retry-' + Math.random().toString(36).slice(2, 8);
    container.innerHTML =
      '<div class="error-msg" role="alert">' +
        '<strong>⚠ Impossible de charger le contenu :</strong><br>' +
        esc(detail) +
      '</div>' +
      '<button id="' + retryId + '" class="btn btn--ghost btn--retry" type="button">↻ Réessayer</button>';
    const btn = document.getElementById(retryId);
    if (btn && typeof onRetry === 'function') {
      btn.addEventListener('click', onRetry);
    }
  }

  function showEmpty(container, msg) {
    if (!container) return;
    container.innerHTML =
      '<div class="empty-msg">' + esc(msg || 'Aucun résultat à afficher pour le moment.') + '</div>';
  }

  // ---------- Carte générique (film ou série) ----------
  function makeCard(item, kind) {
    const title  = item.title || item.name || 'Sans titre';
    const date   = item.release_date || item.first_air_date || '';
    const year   = date ? date.slice(0, 4) : '';
    const score  = (typeof item.vote_average === 'number' && item.vote_average > 0)
      ? item.vote_average.toFixed(1) : '';
    const origin = (item.origin_country && item.origin_country[0]) ||
                   (item.original_language || '').toUpperCase();
    const poster = API.posterUrl(item.poster_path);
    const link   = kind === 'tv' ? ('series.html#tv-' + item.id)
                                : ('films.html#movie-' + item.id);

    const card = document.createElement('article');
    card.className = 'media-card';
    card.dataset.kind = kind;
    card.dataset.id = item.id;
    card.innerHTML =
      '<a class="media-card__link" href="' + link + '">' +
        '<div class="media-card__poster">' +
          (poster
            ? '<img loading="lazy" src="' + poster + '" alt="' + esc(title) + '" onerror="this.parentNode.classList.add(\'no-img\');this.remove();" />'
            : '') +
          '<div class="media-card__poster-fallback" aria-hidden="true">🎬</div>' +
          (score ? '<span class="media-card__score">★ ' + esc(score) + '</span>' : '') +
          (origin ? '<span class="media-card__country" title="Pays d\'origine">' + esc(origin) + '</span>' : '') +
        '</div>' +
        '<div class="media-card__body">' +
          '<h3 class="media-card__title">' + esc(title) + '</h3>' +
          '<p class="media-card__meta">' + esc(year || '—') + '</p>' +
        '</div>' +
      '</a>';
    return card;
  }

  function renderGrid(container, items, kind) {
    container.innerHTML = '';
    if (!items || items.length === 0) {
      showEmpty(container);
      return;
    }
    const frag = document.createDocumentFragment();
    items.forEach(it => frag.appendChild(makeCard(it, kind)));
    container.appendChild(frag);
  }

  // Wrapper générique : gère loading + try/catch + erreur avec retry
  async function loadSection(container, label, fetcher, renderer) {
    showLoading(container, label);
    try {
      const data = await fetcher();
      renderer(container, data);
    } catch (err) {
      console.error('[CinePulse] ' + label, err);
      showError(container, err, () => loadSection(container, label, fetcher, renderer));
    }
  }

  // ---------- Section : tendances globales (accueil) ----------
  function loadHomeTrending() {
    const c = $('#home-trending'); if (!c) return;
    loadSection(c, 'Chargement des tendances…',
      () => API.endpoints.misc.trendingAllWeek(),
      (container, data) => {
        const items = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv')
          .slice(0, 12);
        if (!items.length) { showEmpty(container); return; }
        const frag = document.createDocumentFragment();
        items.forEach(it => {
          const kind = it.media_type === 'tv' ? 'tv' : 'movie';
          frag.appendChild(makeCard(it, kind));
        });
        container.innerHTML = '';
        container.appendChild(frag);
      });
  }

  // ---------- Section : now-playing (films + accueil) ----------
  function loadNowPlaying(container, label) {
    loadSection(container, label,
      () => API.endpoints.movies.nowPlaying(),
      (c, data) => renderGrid(c, (data.results || []).slice(0, 12), 'movie'));
  }

  // ---------- Section : upcoming (films) ----------
  function loadUpcoming(container, label) {
    loadSection(container, label,
      () => API.endpoints.movies.upcoming(),
      (c, data) => renderGrid(c, (data.results || []).slice(0, 12), 'movie'));
  }

  // ---------- Section : cinéma du monde (films) ----------
  function loadWorldMovies(country) {
    const c = $('#films-world'); if (!c) return;
    const label = country
      ? 'Chargement des films ' + country + '…'
      : 'Chargement du cinéma du monde…';
    loadSection(c, label,
      () => country
        ? API.endpoints.movies.discoverByOrigin(country, 1)
        : API.endpoints.movies.topRated(),
      (container, data) => {
        renderGrid(container, (data.results || []).slice(0, 12), 'movie');
        // Après le rendu, on peut afficher le pays comme badge si filtré
        if (country) {
          container.querySelectorAll('.media-card').forEach(card => {
            const badge = document.createElement('span');
            badge.className = 'media-card__country media-card__country--overlay';
            badge.textContent = country;
            card.querySelector('.media-card__poster').appendChild(badge);
          });
        }
      });
  }

  // ---------- Section : séries du jour (accueil) ----------
  function loadHomeToday() {
    const c = $('#home-today'); if (!c) return;
    loadSection(c, 'Chargement des séries du jour…',
      () => API.endpoints.tv.airingToday(),
      (container, data) => renderGrid(container, (data.results || []).slice(0, 12), 'tv'));
  }

  // ---------- Section : calendrier hebdomadaire (séries) ----------
  function loadCalendar() {
    const c = $('#series-calendar'); if (!c) return;
    showLoading(c, 'Chargement du calendrier…');
    API.endpoints.tv.weekCalendar()
      .then(payload => {
        const days = buildWeekDays(payload);
        if (!days.length) { showEmpty(c, 'Aucune diffusion prévue cette semaine.'); return; }
        c.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'calendar__grid';
        days.forEach(day => {
          const card = document.createElement('article');
          card.className = 'calendar-day';
          card.innerHTML =
            '<header class="calendar-day__head">' +
              '<div class="calendar-day__date">' + esc(day.label) + '</div>' +
              '<div class="calendar-day__weekday">' + esc(day.weekday) + '</div>' +
              '<div class="calendar-day__count">' + day.items.length + ' épisode' + (day.items.length > 1 ? 's' : '') + '</div>' +
            '</header>' +
            '<ul class="calendar-day__list">' +
              day.items.slice(0, 4).map(it => {
                const t = esc(it.name || it.original_name || 'Sans titre');
                const s = (it.vote_average && it.vote_average > 0)
                  ? '<span class="calendar-day__score">★ ' + esc(it.vote_average.toFixed(1)) + '</span>' : '';
                return '<li class="calendar-day__item">' + s + '<span>' + t + '</span></li>';
              }).join('') +
              (day.items.length > 4
                ? '<li class="calendar-day__more">+ ' + (day.items.length - 4) + ' autres…</li>'
                : '') +
            '</ul>';
          grid.appendChild(card);
        });
        c.appendChild(grid);
      })
      .catch(err => {
        console.error('[CinePulse] calendar', err);
        showError(c, err, loadCalendar);
      });
  }

  function buildWeekDays(payload) {
    // On génère 7 jours à partir d'aujourd'hui.
    const todayList = (payload && payload.today) || [];
    const onAirList = (payload && payload.onAir) || [];
    const map = new Map();
    todayList.forEach(it => {
      const d = (it.air_date || it.first_air_date || '').slice(0, 10);
      if (!d) return;
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(it);
    });
    // Répartition grossière de onAir sur les 7 jours si on n'a pas la date
    // (TMDB /tv/on_the_air ne donne pas la date par épisode — on les émet sur J+1..J+7)
    onAirList.forEach((it, idx) => {
      const dt = new Date();
      dt.setDate(dt.getDate() + (idx % 7) + 1);
      const d = dt.toISOString().slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(it);
    });

    const days = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date();
      dt.setDate(dt.getDate() + i);
      const key = dt.toISOString().slice(0, 10);
      const items = (map.get(key) || []).slice().sort((a, b) =>
        (b.vote_average || 0) - (a.vote_average || 0));
      days.push({
        date: key,
        label: String(dt.getDate()).padStart(2, '0') + '/' + String(dt.getMonth() + 1).padStart(2, '0'),
        weekday: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][dt.getDay()],
        items
      });
    }
    return days;
  }

  // ---------- Section : nouveautés séries ----------
  function loadSeriesNew() {
    const c = $('#series-new'); if (!c) return;
    loadSection(c, 'Chargement des nouveautés…',
      () => API.endpoints.tv.popular(),
      (container, data) => renderGrid(container, (data.results || []).slice(0, 12), 'tv'));
  }

  // ---------- Section : on the air ----------
  function loadSeriesAiring() {
    const c = $('#series-airing'); if (!c) return;
    loadSection(c, 'Chargement des séries en cours…',
      () => API.endpoints.tv.onTheAir(),
      (container, data) => renderGrid(container, (data.results || []).slice(0, 12), 'tv'));
  }

  // ---------- Section : séries du monde ----------
  function loadWorldSeries(country) {
    const c = $('#series-world'); if (!c) return;
    const label = country
      ? 'Chargement des séries ' + country + '…'
      : 'Chargement des séries du monde…';
    loadSection(c, label,
      () => country
        ? API.endpoints.tv.discoverByOrigin(country, 1)
        : API.endpoints.tv.popular(),
      (container, data) => renderGrid(container, (data.results || []).slice(0, 12), 'tv'));
  }

  // ---------- Filtres pays ----------
  function bindFilters() {
    const sel = $('#world-region');
    if (sel) {
      sel.addEventListener('change', e => loadWorldMovies(e.target.value));
      // 1er chargement
      loadWorldMovies(sel.value);
    }
    const selT = $('#series-world-region');
    if (selT) {
      selT.addEventListener('change', e => loadWorldSeries(e.target.value));
      loadWorldSeries(selT.value);
    }
  }

  // ---------- Bootstrap par page ----------
  function init() {
    // Année footer
    const y = $('#year'); if (y) y.textContent = new Date().getFullYear();

    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    if (path === '' || path === 'index.html' || path === '/') {
      loadHomeTrending();
      loadNowPlaying($('#home-now-playing'), 'Chargement des films à l\'affiche…');
      loadHomeToday();
    } else if (path === 'films.html') {
      loadNowPlaying($('#films-now-playing'), 'Chargement des films à l\'affiche…');
      loadUpcoming($('#films-upcoming'), 'Chargement des prochaines sorties…');
      bindFilters(); // charge aussi films-world
    } else if (path === 'series.html') {
      loadCalendar();
      loadSeriesNew();
      loadSeriesAiring();
      bindFilters(); // charge aussi series-world
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
