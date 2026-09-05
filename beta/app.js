/* Healthy Sounna — Gestion du stock · offert par Fervia · v1.1 */
(function () {
  'use strict';

  /* BETA : cle de stockage a part, pour ne jamais toucher au stock reel.
   Le localStorage est partage par tout le domaine, donc sans ca la beta
   ecrirait dans les memes donnees que l'app en service. */
  var KEY = 'hs_stock_beta';

  /* ---------- Stockage sécurisé (localStorage → fallback mémoire) ---------- */
  var mem = {};
  var storage = {
    get: function (k) {
      try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; }
    }
  };

  /* ---------- État ---------- */
  var state = { products: [], sales: [], view: 'home', cat: null, filterAlert: false, query: '' };
  var editingId = null;
  var undoSnapshot = null, undoTimer = null;

  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function load() {
    var raw = storage.get(KEY);
    if (raw) {
      try {
        var d = JSON.parse(raw);
        if (d && d.products && d.products.length) { state.products = d.products; state.sales = d.sales || []; return; }
      } catch (e) {}
    }
    seed();
  }

  function seed() {
    state.products = SEED_DATA.map(function (p) {
      return { id: uid(), cat: p.cat, name: p.name, brand: p.brand, qty: p.qty, price: p.price, cost: p.cost || 0, promo: p.promo || 0, ddm: p.ddm, note: p.note };
    });
    state.sales = [];
    save();
  }

  function save() {
    storage.set(KEY, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), products: state.products, sales: state.sales }));
  }

  /* ---------- Utilitaires ---------- */
  function euro(n) {
    var s = n.toFixed(2).replace('.', ',');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F') + ' €';
  }

  function norm(s) {
    return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /* Cle des photos : meme normalisation que le script qui a genere photos.js
     (minuscules, sans accents, tout ce qui n'est pas alphanumerique -> espace). */
  function normPhoto(s) {
    return (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function photoDe(p) {
    if (p.img) return p.img;               /* photo ajoutee a la main, elle prime */
    var f = (typeof PHOTOS !== 'undefined') ? PHOTOS[normPhoto(p.name)] : null;
    return f ? 'img/' + f : null;
  }

  function esc(s) {
    return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Prix réellement pratiqué : la promo ne s'applique que si elle est
     renseignée et inférieure au prix normal. */
  function effPrice(p) {
    return (p.promo > 0 && p.promo < p.price) ? p.promo : p.price;
  }

  function enPromo(p) { return effPrice(p) !== p.price; }

  /* Analyse DDM : 'MM/AAAA' ou 'JJ/MM/AAAA' → statut */
  function ddmStatus(ddm) {
    if (!ddm) return null;
    var m = ddm.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    var date = null;
    if (m) {
      date = new Date(+m[3], +m[2] - 1, +m[1]);
    } else {
      m = ddm.match(/(\d{2})\/(\d{4})/);
      if (m) date = new Date(+m[2], +m[1], 0); // fin du mois
    }
    if (!date || isNaN(date)) return null;
    var days = (date - new Date()) / 86400000;
    if (days < 0) return 'past';
    if (days < 180) return 'soon';
    return null;
  }

  function hasAlert(p) {
    var d = ddmStatus(p.ddm);
    return p.qty <= 5 || d === 'past' || d === 'soon' || /DOUBLON/i.test(p.note || '');
  }

  function allCats() {
    var set = {};
    state.products.forEach(function (p) { set[p.cat || 'Divers'] = 1; });
    return Object.keys(set).sort(function (a, b) { return a.localeCompare(b, 'fr'); });
  }

  /* ---------- Rendu ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var listEl = $('list');

  function renderStats() {
    var refs = state.products.length, arts = 0, val = 0;
    state.products.forEach(function (p) { arts += p.qty; val += p.qty * p.price; });
    $('stRefs').textContent = refs;
    $('stArts').textContent = arts;
    $('stVal').textContent = euro(val);
  }

  function salesStats(sinceMs) {
    var n = 0, ca = 0, ben = 0, sansPA = 0;
    state.sales.forEach(function (s) {
      if (sinceMs && s.t < sinceMs) return;
      n++; ca += s.price;
      if (s.cost > 0) ben += (s.price - s.cost); else sansPA++;
    });
    return { n: n, ca: ca, ben: ben, sansPA: sansPA };
  }

  function startOfToday() {
    var d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
  }

  function catEmoji(c) {
    var n = norm(c);
    if (n.indexOf('miel') > -1 || n.indexOf('epicerie') > -1) return '🍯';
    if (n.indexOf('complement') > -1) return '💊';
    if (n.indexOf('cosmet') > -1 || n.indexOf('soin') > -1) return '🧴';
    if (n.indexOf('livre') > -1) return '📚';
    if (n.indexOf('boisson') > -1 || n.indexOf('superfood') > -1) return '🍵';
    if (n.indexOf('medecine') > -1 || n.indexOf('prophet') > -1) return '🌿';
    if (n.indexOf('huile') > -1) return '🫗';
    if (n.indexOf('herbe') > -1 || n.indexOf('epice') > -1) return '🌱';
    return '📦';
  }

  function renderHome() {
    var cats = allCats();
    var alertCount = state.products.filter(hasAlert).length;
    var html = '';
    if (alertCount) {
      html += '<button class="alert-banner" data-alerts="1"><span>⚠️ ' + alertCount +
        ' produit' + (alertCount > 1 ? 's' : '') + ' à surveiller</span><em>stock bas · DDM · doublons →</em></button>';
    }
    var st = salesStats(startOfToday());
    html += '<button class="sales-card" data-sales="1"><div><span class="sc-label">💰 Recettes du jour</span>' +
      '<b>' + euro(st.ca) + '</b></div>' +
      '<div class="sc-right"><span class="sc-label">Bénéfice</span><b>' + (st.n ? euro(st.ben) : '—') + '</b>' +
      '<em>' + st.n + ' vente' + (st.n > 1 ? 's' : '') + ' →</em></div></button>';
    html += '<div class="grid">';
    cats.forEach(function (c) {
      var refs = 0, arts = 0, warn = 0;
      state.products.forEach(function (p) {
        if ((p.cat || 'Divers') === c) {
          refs++; arts += p.qty;
          if (hasAlert(p)) warn++;
        }
      });
      html += '<button class="cat-card" data-cat-open="' + esc(c) + '">' +
        '<div class="cc-top"><span class="cc-ico">' + catEmoji(c) + '</span>' +
        (warn ? '<span class="cc-warn">⚠ ' + warn + '</span>' : '') + '</div>' +
        '<b>' + esc(c) + '</b>' +
        '<span>' + refs + ' réf. · ' + arts + ' articles</span>' +
        '</button>';
    });
    html += '</div>';
    listEl.innerHTML = html;
  }

  function badgesHtml(p) {
    var b = '';
    if (p.qty === 0) b += '<span class="badge b-out">Épuisé</span>';
    else if (p.qty <= 5) b += '<span class="badge b-low">Stock bas</span>';
    var d = ddmStatus(p.ddm);
    if (d === 'past') b += '<span class="badge b-ddm">DDM dépassée</span>';
    else if (d === 'soon') b += '<span class="badge b-ddmsoon">DDM proche</span>';
    if (enPromo(p)) b += '<span class="badge b-promo">Promo</span>';
    if (/DOUBLON/i.test(p.note || '')) b += '<span class="badge b-dup">À vérifier</span>';
    return b ? '<div class="badges">' + b + '</div>' : '';
  }

  function cardHtml(p) {
    var meta = [];
    if (p.brand) meta.push(esc(p.brand));
    if (enPromo(p)) meta.push('<s>' + euro(p.price) + '</s> <b>' + euro(p.promo) + '</b>');
    else meta.push('<b>' + euro(p.price) + '</b>');
    if (p.cost) meta.push('<span class="pa">PA ' + euro(p.cost) + '</span>');
    if (p.ddm) meta.push('DDM ' + esc(p.ddm));
    var photo = photoDe(p);
    var vign = photo
      ? '<img class="vign" src="' + esc(photo) + '" alt="" loading="lazy">'
      : '<div class="vign vign-vide">' + catEmoji(p.cat) + '</div>';
    return '<div class="card' + (p.qty === 0 ? ' zero' : '') + '">' + vign +
      '<div class="p-info" data-edit="' + p.id + '">' +
        '<div class="p-name">' + esc(p.name) + ' <span class="edit-hint">✎</span></div>' +
        '<div class="p-meta">' + meta.join(' · ') + '</div>' +
        badgesHtml(p) +
      '</div>' +
      '<div class="qty-box">' +
        '<div class="qty-val">' + p.qty + '</div>' +
        '<div class="qty-btns">' +
          '<button class="qb minus" data-minus="' + p.id + '" ' + (p.qty === 0 ? 'disabled' : '') + '>−</button>' +
          '<button class="qb plus" data-plus="' + p.id + '">+</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function renderProducts(items, title, grouped, subtitle, sortable, catDelete) {
    var html = '<div class="backbar"><button data-back="1">← Retour</button><h3>' + esc(title) +
      ' <em>' + items.length + '</em></h3>' +
      (catDelete ? '<button class="backbar-del" data-delcat="1" title="Supprimer la catégorie">🗑️</button>' : '') +
      '</div>';
    if (subtitle) html += '<div class="cat-stats">' + subtitle + '</div>';
    if (sortable) {
      html += '<div class="sort-row">';
      [['nom', 'Nom'], ['stock', 'Stock ↑'], ['prix', 'Prix ↓'], ['marge', 'Marge ↓']].forEach(function (t) {
        html += '<button class="sort-chip' + (catSort === t[0] ? ' on' : '') + '" data-sort="' + t[0] + '">' + t[1] + '</button>';
      });
      html += '</div>';
    }
    if (!items.length) {
      html += '<div class="empty">Aucun produit trouvé.<br>Modifie ta recherche ou ajoute un produit avec le bouton +.</div>';
      listEl.innerHTML = html;
      return;
    }
    if (grouped) {
      var groups = {};
      items.forEach(function (p) {
        var c = p.cat || 'Divers';
        (groups[c] = groups[c] || []).push(p);
      });
      Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'fr'); }).forEach(function (c) {
        html += '<div class="cat-head"><span>' + esc(c) + '</span><em>' + groups[c].length + ' réf.</em></div>';
        html += '<div class="' + classeGrille() + '">';
        groups[c].sort(byName).forEach(function (p) { html += cardHtml(p); });
        html += '</div>';
      });
    } else {
      html += '<div class="' + classeGrille() + '">';
      sortItems(items).forEach(function (p) { html += cardHtml(p); });
      html += '</div>';
    }
    listEl.innerHTML = html;
  }

  function byName(a, b) { return norm(a.name).localeCompare(norm(b.name), 'fr'); }

  var salesPeriod = 'jour';
  var catSort = 'nom';
  var CLE_COLONNES = 'hs_colonnes';
  var colonnes = (storage.get(CLE_COLONNES) === '2') ? 2 : 1;

  function classeGrille() { return colonnes === 2 ? 'grille2' : 'liste1'; }

  function sortItems(items) {
    var s = items.slice();
    if (catSort === 'stock') s.sort(function (a, b) { return a.qty - b.qty || byName(a, b); });
    else if (catSort === 'prix') s.sort(function (a, b) { return effPrice(b) - effPrice(a) || byName(a, b); });
    else if (catSort === 'marge') s.sort(function (a, b) {
      var ma = a.cost > 0 ? effPrice(a) - a.cost : -1, mb = b.cost > 0 ? effPrice(b) - b.cost : -1;
      return mb - ma || byName(a, b);
    });
    else s.sort(byName);
    return s;
  }

  function chartHtml() {
    var days = [], max = 0;
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      var start = d.getTime(), end = start + 86400000, ca = 0;
      state.sales.forEach(function (s) { if (s.t >= start && s.t < end) ca += s.price; });
      days.push({ label: d.toLocaleDateString('fr-BE', { weekday: 'short' }).replace('.', ''), ca: ca });
      if (ca > max) max = ca;
    }
    var bars = '';
    days.forEach(function (d) {
      var h = max > 0 ? Math.max(4, Math.round(d.ca / max * 68)) : 4;
      bars += '<div class="bar-col"><div class="bar-val">' + (d.ca > 0 ? Math.round(d.ca) : '') + '</div>' +
        '<div class="bar" style="height:' + h + 'px"></div><span>' + d.label + '</span></div>';
    });
    return '<div class="chart-card"><div class="chart-title">7 derniers jours · Chiffre d\u2019affaires (€)</div><div class="chart">' + bars + '</div></div>';
  }

  function renderSales() {
    var now = Date.now();
    var bounds = { jour: startOfToday(), semaine: now - 7 * 86400000, mois: now - 30 * 86400000, tout: 0 };
    var since = bounds[salesPeriod];
    var st = salesStats(since);
    var html = '<div class="backbar"><button data-back="1">← Retour</button><h3>💰 Recettes</h3></div>';
    html += '<div class="ptabs">';
    [['jour', "Aujourd'hui"], ['semaine', '7 jours'], ['mois', '30 jours'], ['tout', 'Tout']].forEach(function (t) {
      html += '<button class="ptab' + (salesPeriod === t[0] ? ' on' : '') + '" data-period="' + t[0] + '">' + t[1] + '</button>';
    });
    html += '</div>';
    html += '<div class="s-kpis">' +
      '<div class="s-kpi"><b>' + st.n + '</b><span>Ventes</span></div>' +
      '<div class="s-kpi"><b>' + euro(st.ca) + '</b><span>Chiffre d\u2019affaires</span></div>' +
      '<div class="s-kpi lime"><b>' + (st.n ? euro(st.ben) : '—') + '</b><span>Bénéfice</span></div>' +
    '</div>';
    html += chartHtml();
    if (st.sansPA) {
      html += '<div class="s-warn">⚠️ ' + st.sansPA + ' vente' + (st.sansPA > 1 ? 's' : '') +
        ' sans prix d\u2019achat renseigné — le bénéfice réel est plus élevé que le chiffre affiché.</div>';
    }
    var list = state.sales.filter(function (s) { return !since || s.t >= since; }).slice().reverse().slice(0, 100);
    if (!list.length) {
      html += '<div class="empty">Aucune vente sur cette période.<br>Chaque appui sur − enregistre une vente automatiquement.</div>';
    } else {
      list.forEach(function (s) {
        var d = new Date(s.t);
        function z(n) { return (n < 10 ? '0' : '') + n; }
        var when = z(d.getDate()) + '/' + z(d.getMonth() + 1) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes());
        html += '<div class="s-row"><div class="s-info"><div class="s-name">' + esc(s.name) + '</div>' +
          '<div class="s-meta">' + when + ' · ' + euro(s.price) + (s.full ? ' <s>' + euro(s.full) + '</s>' : '') +
          (s.cost > 0 ? ' · bénéf ' + euro(s.price - s.cost) : ' · PA non renseigné') + '</div></div>' +
          '<button class="s-del" data-delsale="' + s.t + '_' + s.id + '">✕</button></div>';
      });
    }
    listEl.innerHTML = html;
  }

  function render() {
    renderStats();
    var q = norm(state.query);
    if (q) {
      var res = state.products.filter(function (p) {
        return norm(p.name + ' ' + p.brand + ' ' + p.cat).indexOf(q) > -1;
      });
      renderProducts(res, 'Recherche', true);
    } else if (state.filterAlert) {
      renderProducts(state.products.filter(hasAlert), '⚠️ À surveiller', true);
    } else if (state.view === 'sales') {
      renderSales();
    } else if (state.view === 'cat' && state.cat) {
      var items = state.products.filter(function (p) { return (p.cat || 'Divers') === state.cat; });
      var arts = 0, val = 0;
      items.forEach(function (p) { arts += p.qty; val += p.qty * p.price; });
      renderProducts(items, state.cat, false, arts + ' articles en stock · Valeur : <b>' + euro(val) + '</b>', true, true);
    } else {
      renderHome();
    }
  }

  function goHome() {
    state.view = 'home'; state.cat = null; state.filterAlert = false;
    state.query = ''; searchEl.value = ''; btnClear.style.display = 'none';
    render();
    window.scrollTo(0, 0);
  }

  /* ---------- Actions quantité + annulation ---------- */
  function findP(id) {
    for (var i = 0; i < state.products.length; i++) if (state.products[i].id === id) return state.products[i];
    return null;
  }

  function changeQty(id, delta) {
    var p = findP(id);
    if (!p) return;
    var next = p.qty + delta;
    if (next < 0) return;
    undoSnapshot = { id: id, qty: p.qty, sale: null };
    p.qty = next;
    var eff = effPrice(p);
    if (delta < 0) {
      if (navigator.vibrate) navigator.vibrate(15);
      var sale = { t: Date.now(), id: p.id, name: p.name, price: eff, cost: p.cost || 0 };
      if (eff !== p.price) sale.full = p.price;
      state.sales.push(sale);
      undoSnapshot.sale = sale;
    }
    save(); render();
    showToast(delta < 0 ? ('Vente · ' + p.name + ' · ' + euro(eff) + (eff !== p.price ? ' (promo)' : '')) : ('+1 · ' + p.name + ' → ' + p.qty));
  }

  function showToast(msg) {
    $('toastMsg').textContent = msg;
    var t = $('toast');
    t.classList.add('show');
    clearTimeout(undoTimer);
    undoTimer = setTimeout(function () { t.classList.remove('show'); undoSnapshot = null; }, 4000);
  }

  $('toastUndo').addEventListener('click', function () {
    if (undoSnapshot) {
      var p = findP(undoSnapshot.id);
      if (p) p.qty = undoSnapshot.qty;
      if (undoSnapshot.sale) {
        var i = state.sales.indexOf(undoSnapshot.sale);
        if (i > -1) state.sales.splice(i, 1);
      }
      save(); render();
      undoSnapshot = null;
    }
    $('toast').classList.remove('show');
  });

  /* ---------- Délégation clics ---------- */
  listEl.addEventListener('click', function (e) {
    var el = e.target.closest('[data-minus],[data-plus],[data-edit],[data-cat-open],[data-back],[data-alerts],[data-sales],[data-period],[data-delsale],[data-sort],[data-delcat]');
    if (!el) return;
    if (el.dataset.minus) changeQty(el.dataset.minus, -1);
    else if (el.dataset.plus) changeQty(el.dataset.plus, +1);
    else if (el.dataset.edit) openForm(el.dataset.edit);
    else if (el.dataset.catOpen) { state.view = 'cat'; state.cat = el.dataset.catOpen; render(); window.scrollTo(0, 0); }
    else if (el.dataset.back) goHome();
    else if (el.dataset.alerts) { state.filterAlert = true; render(); window.scrollTo(0, 0); }
    else if (el.dataset.sales) { state.view = 'sales'; render(); window.scrollTo(0, 0); }
    else if (el.dataset.period) { salesPeriod = el.dataset.period; renderSales(); }
    else if (el.dataset.sort) { catSort = el.dataset.sort; render(); }
    else if (el.dataset.delsale) {
      var parts = el.dataset.delsale.split('_');
      dialog({ title: 'Supprimer cette vente ?', msg: 'Le stock ne sera pas modifié — utilise + si tu veux remettre l\u2019article en rayon.', danger: true, okLabel: 'Supprimer' })
        .then(function (ok) {
          if (!ok) return;
          for (var k = 0; k < state.sales.length; k++) {
            if (String(state.sales[k].t) === parts[0] && state.sales[k].id === parts[1]) { state.sales.splice(k, 1); break; }
          }
          save(); renderSales();
        });
    }
    else if (el.dataset.delcat) {
      var cat = state.cat;
      var items = state.products.filter(function (p) { return (p.cat || 'Divers') === cat; });
      var arts = 0;
      items.forEach(function (p) { arts += p.qty; });
      dialog({ title: 'Supprimer cette catégorie ?', msg: 'Les ' + items.length + ' références de « ' + cat + ' » (' + arts + ' articles) seront supprimées définitivement. Cette action est irréversible.', danger: true, okLabel: 'Supprimer' })
        .then(function (ok) {
          if (!ok) return;
          state.products = state.products.filter(function (p) { return (p.cat || 'Divers') !== cat; });
          save(); goHome();
        });
    }
  });

  /* ---------- Recherche ---------- */
  var searchEl = $('search'), btnClear = $('btnClear');
  searchEl.addEventListener('input', function () {
    state.query = searchEl.value;
    btnClear.style.display = state.query ? 'block' : 'none';
    render();
  });
  btnClear.addEventListener('click', function () {
    searchEl.value = ''; state.query = ''; btnClear.style.display = 'none'; render(); searchEl.focus();
  });

  /* ---------- Modales ---------- */
  function open(ov) { ov.classList.add('open'); }
  function close(ov) { ov.classList.remove('open'); }
  document.querySelectorAll('.overlay:not(#ovDialog)').forEach(function (ov) {
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.hasAttribute('data-close')) close(ov);
    });
  });

  /* ---------- Dialogue maison ---------- */
  var ovDialog = $('ovDialog'), dlgResolve = null;
  function dialog(o) {
    return new Promise(function (resolve) {
      dlgResolve = resolve;
      $('dlgTitle').textContent = o.title || '';
      $('dlgMsg').textContent = o.msg || '';
      $('dlgMsg').style.display = o.msg ? 'block' : 'none';
      var inp = $('dlgInput');
      inp.style.display = o.input ? 'block' : 'none';
      inp.value = o.value || '';
      inp.placeholder = o.placeholder || '';
      $('dlgOk').textContent = o.okLabel || 'Confirmer';
      $('dlgOk').className = o.danger ? 'danger' : '';
      $('dlgCancel').style.display = o.alert ? 'none' : 'block';
      open(ovDialog);
      if (o.input) setTimeout(function () { inp.focus(); }, 200);
    });
  }
  function dlgClose(v) {
    close(ovDialog);
    if (dlgResolve) { var r = dlgResolve; dlgResolve = null; r(v); }
  }
  $('dlgOk').addEventListener('click', function () {
    var inp = $('dlgInput');
    dlgClose(inp.style.display !== 'none' ? inp.value.trim() : true);
  });
  $('dlgCancel').addEventListener('click', function () { dlgClose(null); });
  ovDialog.addEventListener('click', function (e) { if (e.target === ovDialog) dlgClose(null); });

  var ovForm = $('ovForm'), ovMenu = $('ovMenu');
  $('btnMenu').addEventListener('click', function () { open(ovMenu); });
  $('fab').addEventListener('click', function () { openForm(null); });

  var ovCat = $('ovCat'), formCat = '';
  function setFormCat(c) { formCat = c; $('fCatVal').textContent = c; }
  $('fCat').addEventListener('click', function () {
    var html = '';
    allCats().forEach(function (c) {
      html += '<button class="cat-opt' + (c === formCat ? ' on' : '') + '" data-pickcat="' + esc(c) + '">' +
        '<span class="co-ico">' + catEmoji(c) + '</span>' + esc(c) + (c === formCat ? ' ✓' : '') + '</button>';
    });
    html += '<button class="cat-opt" data-newcat="1"><span class="co-ico">➕</span>Nouvelle catégorie…</button>';
    $('catList').innerHTML = html;
    open(ovCat);
  });
  $('catList').addEventListener('click', function (e) {
    var el = e.target.closest('[data-pickcat],[data-newcat]');
    if (!el) return;
    if (el.dataset.pickcat) { setFormCat(el.dataset.pickcat); close(ovCat); }
    else {
      close(ovCat);
      dialog({ title: 'Nouvelle catégorie', input: true, placeholder: 'Nom de la catégorie', okLabel: 'Créer' })
        .then(function (name) { if (name) setFormCat(name); });
    }
  });

  /* ---------- Photo choisie a la main ----------
     L'image est redimensionnee DANS LE NAVIGATEUR avant d'etre gardee : le
     stockage local tient environ 5 Mo pour toute l'app, une photo de telephone
     brute en fait 3 a 8 a elle seule. On vise 320 px, comme les images du
     catalogue, et on verifie apres coup que l'enregistrement a vraiment tenu. */
  var photoForm = null;   /* valeur en cours d'edition : data URL, '' (retiree) ou null (inchangee) */

  function redimensionner(fichier) {
    return new Promise(function (resolve, reject) {
      var lecteur = new FileReader();
      lecteur.onerror = function () { reject(new Error('lecture')); };
      lecteur.onload = function () {
        var im = new Image();
        im.onerror = function () { reject(new Error('image')); };
        im.onload = function () {
          var MAX = 320;
          var r = Math.min(1, MAX / Math.max(im.width, im.height));
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * r));
          c.height = Math.max(1, Math.round(im.height * r));
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(im, 0, 0, c.width, c.height);
          var sortie = c.toDataURL('image/webp', 0.8);
          if (sortie.indexOf('data:image/webp') !== 0) sortie = c.toDataURL('image/jpeg', 0.82);
          resolve(sortie);
        };
        im.src = lecteur.result;
      };
      lecteur.readAsDataURL(fichier);
    });
  }

  function peindrePhotoForm(valeur) {
    var ap = $('fPhotoApercu'), etat = $('fPhotoEtat');
    if (valeur) {
      ap.innerHTML = '<img src="' + valeur + '" alt="">';
      $('btnPhotoRetirer').style.display = 'block';
      $('btnPhotoChoisir').textContent = 'Changer la photo';
      etat.textContent = (valeur.indexOf('data:') === 0)
        ? 'Photo ajoutée (' + Math.round(valeur.length / 1024) + ' Ko)'
        : 'Photo du catalogue';
    } else {
      ap.innerHTML = '<span>📷</span>';
      $('btnPhotoRetirer').style.display = 'none';
      $('btnPhotoChoisir').textContent = 'Choisir une photo';
      etat.textContent = 'Aucune photo';
    }
  }

  $('btnPhotoChoisir').addEventListener('click', function () { $('filePhoto').click(); });

  $('filePhoto').addEventListener('change', function () {
    var f = this.files[0];
    this.value = '';
    if (!f) return;
    $('fPhotoEtat').textContent = 'Traitement…';
    redimensionner(f).then(function (dataUrl) {
      photoForm = dataUrl;
      peindrePhotoForm(dataUrl);
    }).catch(function () {
      dialog({ title: 'Image illisible', msg: 'Ce fichier n\u2019a pas pu être lu. Essaie une photo JPEG ou PNG.', alert: true, okLabel: 'OK' });
      $('fPhotoEtat').textContent = '';
    });
  });

  $('btnPhotoRetirer').addEventListener('click', function () {
    photoForm = '';
    peindrePhotoForm(null);
  });

  function openForm(id) {
    editingId = id;
    var p = id ? findP(id) : null;
    photoForm = null;
    peindrePhotoForm(p ? photoDe(p) : null);
    $('formTitle').textContent = p ? 'Modifier le produit' : 'Ajouter un produit';
    $('btnDelete').style.display = p ? 'block' : 'none';
    setFormCat(p ? p.cat : (state.view === 'cat' && state.cat ? state.cat : allCats()[0]));
    $('fName').value = p ? p.name : '';
    $('fBrand').value = p ? p.brand : '';
    $('fQty').value = p ? p.qty : '';
    $('fPrice').value = p ? p.price : '';
    $('fPromo').value = (p && p.promo) ? p.promo : '';
    $('fCost').value = (p && p.cost) ? p.cost : '';
    $('fDdm').value = p ? p.ddm : '';
    $('fNote').value = p ? p.note : '';
    updateMarge();
    open(ovForm);
    if (!p) setTimeout(function () { $('fName').focus(); }, 250);
  }

  function updateMarge() {
    var pv = parseFloat(($('fPrice').value || '').replace(',', '.'));
    var pp = parseFloat(($('fPromo').value || '').replace(',', '.'));
    var pa = parseFloat(($('fCost').value || '').replace(',', '.'));
    var el = $('fMarge');
    var promo = pp > 0 && pv > 0 && pp < pv;
    if (pp > 0 && pv > 0 && pp >= pv) {
      el.textContent = '⚠️ Le prix promo doit être inférieur au prix de vente, sinon il sera ignoré.';
      el.style.display = 'block';
      return;
    }
    if (pv > 0 && pa > 0) {
      var base = promo ? pp : pv;
      var m = base - pa;
      var pct = Math.round((m / base) * 100);
      el.textContent = (promo ? 'Marge promo : ' : 'Marge : ') + euro(m) + ' (' + pct + ' % du prix de vente' +
        (promo ? ' promo, au lieu de ' + euro(pv - pa) + ' au prix normal' : '') + ')';
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }
  $('fPrice').addEventListener('input', updateMarge);
  $('fPromo').addEventListener('input', updateMarge);
  $('fCost').addEventListener('input', updateMarge);

  $('btnSave').addEventListener('click', function () {
    var name = $('fName').value.trim();
    var qty = parseInt($('fQty').value, 10);
    if (!name) { dialog({ title: 'Nom manquant', msg: 'Le nom du produit est obligatoire.', alert: true, okLabel: 'OK' }); return; }
    if (isNaN(qty) || qty < 0) { dialog({ title: 'Quantité invalide', msg: 'Indique une quantité valide (0 ou plus).', alert: true, okLabel: 'OK' }); return; }
    var price = parseFloat(($('fPrice').value || '0').replace(',', '.'));
    if (isNaN(price) || price < 0) price = 0;
    var cost = parseFloat(($('fCost').value || '0').replace(',', '.'));
    if (isNaN(cost) || cost < 0) cost = 0;
    var promo = parseFloat(($('fPromo').value || '0').replace(',', '.'));
    if (isNaN(promo) || promo < 0) promo = 0;
    var data = {
      cat: formCat || 'Divers',
      name: name,
      brand: $('fBrand').value.trim(),
      qty: qty,
      price: price,
      cost: cost,
      promo: promo,
      ddm: $('fDdm').value.trim(),
      note: $('fNote').value.trim()
    };
    if (photoForm !== null) {
      if (photoForm === '') data.img = '';
      else data.img = photoForm;
    }
    var cible;
    if (editingId) {
      cible = findP(editingId);
      if (cible) Object.keys(data).forEach(function (k) { cible[k] = data[k]; });
    } else {
      data.id = uid();
      state.products.push(data);
      cible = data;
    }
    var avant = storage.get(KEY);
    save();
    /* Le stockage local est plafonne (environ 5 Mo). Quand il deborde, l'ecriture
       echoue et le repli en memoire donne l'illusion d'un enregistrement reussi
       jusqu'au prochain demarrage. On relit donc pour verifier, et on annule la
       photo plutot que de laisser croire qu'elle est gardee. */
    var relu = storage.get(KEY);
    if (photoForm && cible && (!relu || relu.indexOf(String(cible.img).slice(0, 60)) === -1)) {
      delete cible.img;
      if (avant) storage.set(KEY, avant);
      save();
      render(); close(ovForm);
      dialog({ title: 'Photo non enregistrée', msg: 'La mémoire de l\u2019application est pleine. Le produit est bien enregistré, mais pas sa photo. Retire quelques photos ajoutées à la main pour faire de la place.', alert: true, okLabel: 'OK' });
      return;
    }
    render(); close(ovForm);
  });

  $('btnDelete').addEventListener('click', function () {
    var p = findP(editingId);
    if (!p) return;
    dialog({ title: 'Supprimer le produit ?', msg: '« ' + p.name + ' » sera retiré définitivement du stock.', danger: true, okLabel: 'Supprimer' })
      .then(function (ok) {
        if (!ok) return;
        state.products = state.products.filter(function (x) { return x.id !== editingId; });
        save(); render(); close(ovForm);
      });
  });

  /* ---------- Export / Import / Reset ---------- */
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function stamp() {
    var d = new Date();
    function z(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  $('mExportJson').addEventListener('click', function () {
    download('healthy-sounna-stock-' + stamp() + '.json',
      JSON.stringify({ v: 1, savedAt: new Date().toISOString(), products: state.products, sales: state.sales }, null, 1),
      'application/json');
    close(ovMenu);
  });

  $('mExportCsv').addEventListener('click', function () {
    var rows = [['Catégorie', 'Produit', 'Marque', 'Qté', 'Prix achat HT €', 'Prix vente €', 'Prix promo €', 'Valeur vente €', 'DDM', 'Notes']];
    state.products.forEach(function (p) {
      rows.push([p.cat, p.name, p.brand, p.qty,
        (p.cost ? p.cost.toFixed(2).replace('.', ',') : ''),
        p.price.toFixed(2).replace('.', ','),
        (enPromo(p) ? p.promo.toFixed(2).replace('.', ',') : ''),
        (p.qty * p.price).toFixed(2).replace('.', ','),
        p.ddm, p.note]);
    });
    var csv = '\uFEFF' + rows.map(function (r) {
      return r.map(function (c) { return '"' + (c === undefined || c === null ? '' : c).toString().replace(/"/g, '""') + '"'; }).join(';');
    }).join('\r\n');
    download('healthy-sounna-stock-' + stamp() + '.csv', csv, 'text/csv;charset=utf-8');
    close(ovMenu);
  });

  $('mExportVentes').addEventListener('click', function () {
    var rows = [['Date', 'Heure', 'Produit', 'Prix vente €', 'Prix normal €', 'Prix achat €', 'Bénéfice €']];
    state.sales.forEach(function (s) {
      var d = new Date(s.t);
      function z(n) { return (n < 10 ? '0' : '') + n; }
      rows.push([z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear(), z(d.getHours()) + ':' + z(d.getMinutes()),
        s.name, s.price.toFixed(2).replace('.', ','),
        (s.full ? s.full.toFixed(2).replace('.', ',') : ''),
        (s.cost > 0 ? s.cost.toFixed(2).replace('.', ',') : ''),
        (s.cost > 0 ? (s.price - s.cost).toFixed(2).replace('.', ',') : '')]);
    });
    var csv = '\uFEFF' + rows.map(function (r) {
      return r.map(function (c) { return '"' + (c === undefined || c === null ? '' : c).toString().replace(/"/g, '""') + '"'; }).join(';');
    }).join('\r\n');
    download('healthy-sounna-ventes-' + stamp() + '.csv', csv, 'text/csv;charset=utf-8');
    close(ovMenu);
  });

  $('mImport').addEventListener('click', function () { $('fileImport').click(); });
  $('fileImport').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var d = JSON.parse(reader.result);
        if (!d || !d.products || !d.products.length) throw new Error('vide');
        dialog({ title: 'Restaurer la sauvegarde ?', msg: 'Le stock actuel sera remplacé par cette sauvegarde (' + d.products.length + ' produits).', okLabel: 'Restaurer' })
          .then(function (ok) {
            if (!ok) return;
            state.products = d.products.map(function (p) {
              return { id: p.id || uid(), cat: p.cat || 'Divers', name: p.name || '?', brand: p.brand || '',
                       qty: Math.max(0, parseInt(p.qty, 10) || 0), price: parseFloat(p.price) || 0, cost: parseFloat(p.cost) || 0,
                       promo: parseFloat(p.promo) || 0, ddm: p.ddm || '', note: p.note || '' };
            });
            state.sales = (d.sales || []).filter(function (s) { return s && s.t && s.name; });
            save(); render(); close(ovMenu);
          });
      } catch (e) { dialog({ title: 'Fichier invalide', msg: 'Utilise une sauvegarde JSON exportée depuis cette application.', alert: true, okLabel: 'OK' }); }
    };
    reader.readAsText(f);
    this.value = '';
  });

  $('mReset').addEventListener('click', function () {
    close(ovMenu);
    dialog({ title: 'Réinitialiser ?', msg: 'L\u2019inventaire de référence du 13/07/2026 sera restauré. Les modifications actuelles seront perdues (pense à exporter avant).', danger: true, okLabel: 'Réinitialiser' })
      .then(function (ok) { if (ok) { seed(); goHome(); } });
  });

  function zeroStock() {
    state.products.forEach(function (p) { p.qty = 0; });
    save(); goHome();
  }

  $('mZero').addEventListener('click', function () {
    close(ovMenu);
    dialog({ title: 'Tout remettre à zéro ?', msg: 'Les quantités des ' + state.products.length + ' références passeront à 0. Les produits, prix et catégories restent inchangés, seul le stock repart à zéro pour un nouveau comptage. Pense à exporter une sauvegarde avant si tu veux garder une trace de l\u2019état actuel.', danger: true, okLabel: 'Remettre à zéro' })
      .then(function (ok) { if (ok) zeroStock(); });
  });

  /* ---------- Affichage 1 / 2 colonnes ---------- */
  function peindreLibelleColonnes() {
    var el = $('mColonnesTexte');
    if (el) el.textContent = 'Affichage : ' + (colonnes === 2 ? '2 colonnes' : '1 colonne');
  }

  $('mColonnes').addEventListener('click', function () {
    colonnes = (colonnes === 2) ? 1 : 2;
    storage.set(CLE_COLONNES, String(colonnes));
    peindreLibelleColonnes();
    render();
  });

  /* ---------- Ajouter les produits du catalogue absents du stock ----------
     Ajoute sans rien ecraser : les quantites deja comptees ne bougent pas.
     C'est ce qui permet de recevoir de nouveaux produits sans passer par
     « Reinitialiser », qui lui remet tout l'inventaire a son etat de reference. */
  $('mFusion').addEventListener('click', function () {
    close(ovMenu);
    var connus = {};
    state.products.forEach(function (p) { connus[normPhoto(p.name)] = true; });
    var ajouts = SEED_DATA.filter(function (p) { return !connus[normPhoto(p.name)]; });
    if (!ajouts.length) {
      dialog({ title: 'Rien à ajouter', msg: 'Tous les produits du catalogue sont déjà dans ton stock.', alert: true, okLabel: 'OK' });
      return;
    }
    dialog({ title: ajouts.length + ' produit' + (ajouts.length > 1 ? 's' : '') + ' à ajouter ?',
             msg: 'Ils arriveront avec une quantité de 0, prêts à être comptés. Tes quantités actuelles ne changent pas.',
             okLabel: 'Ajouter' })
      .then(function (ok) {
        if (!ok) return;
        ajouts.forEach(function (p) {
          state.products.push({ id: uid(), cat: p.cat, name: p.name, brand: p.brand, qty: 0,
                                price: p.price, cost: p.cost || 0, promo: p.promo || 0, ddm: p.ddm, note: p.note });
        });
        save(); goHome();
      });
  });

  /* ---------- Clavier : garder le champ actif visible ---------- */
  document.addEventListener('focusin', function (e) {
    if (e.target.matches('input, select, textarea')) {
      setTimeout(function () {
        try { e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) {}
      }, 260);
    }
  });

  /* ---------- Démarrage ---------- */
  /* Filet posé le 05/09/2026, avec la mise a jour qui importe le catalogue :
     Younes etant en voyage, il ne pouvait pas exporter sa sauvegarde avant.
     On garde donc une copie de son etat au premier lancement de cette version,
     sous une cle a part, ecrite UNE SEULE FOIS et jamais relue automatiquement.
     Elle ne protege pas d'un effacement des donnees du site par le telephone,
     mais elle protege d'un « Reinitialiser » malencontreux et d'un defaut ici. */
  try {
    var brutAvantMaj = storage.get(KEY);
    if (brutAvantMaj && !storage.get('hs_stock_beta_avant_maj')) {
      storage.set('hs_stock_beta_avant_maj', brutAvantMaj);
    }
  } catch (e) {}

  load();
  peindreLibelleColonnes();
  render();
})();
