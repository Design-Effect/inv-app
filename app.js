/* Healthy Sounna — Gestion du stock · offert par Fervia · v1.1 */
(function () {
  'use strict';

  var KEY = 'hs_stock_v1';

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
      return { id: uid(), cat: p.cat, name: p.name, brand: p.brand, qty: p.qty, price: p.price, cost: p.cost || 0, ddm: p.ddm, note: p.note };
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

  function esc(s) {
    return (s || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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
    if (/DOUBLON/i.test(p.note || '')) b += '<span class="badge b-dup">À vérifier</span>';
    return b ? '<div class="badges">' + b + '</div>' : '';
  }

  function cardHtml(p) {
    var meta = [];
    if (p.brand) meta.push(esc(p.brand));
    meta.push('<b>' + euro(p.price) + '</b>');
    if (p.cost) meta.push('<span class="pa">PA ' + euro(p.cost) + '</span>');
    if (p.ddm) meta.push('DDM ' + esc(p.ddm));
    return '<div class="card' + (p.qty === 0 ? ' zero' : '') + '">' +
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

  function renderProducts(items, title, grouped, subtitle) {
    var html = '<div class="backbar"><button data-back="1">← Catégories</button><h3>' + esc(title) +
      ' <em>' + items.length + '</em></h3></div>';
    if (subtitle) html += '<div class="cat-stats">' + subtitle + '</div>';
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
        groups[c].sort(byName).forEach(function (p) { html += cardHtml(p); });
      });
    } else {
      items.sort(byName).forEach(function (p) { html += cardHtml(p); });
    }
    listEl.innerHTML = html;
  }

  function byName(a, b) { return norm(a.name).localeCompare(norm(b.name), 'fr'); }

  var salesPeriod = 'jour';

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
          '<div class="s-meta">' + when + ' · ' + euro(s.price) + (s.cost > 0 ? ' · bénéf ' + euro(s.price - s.cost) : ' · PA non renseigné') + '</div></div>' +
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
      renderProducts(items, state.cat, false, arts + ' articles en stock · Valeur : <b>' + euro(val) + '</b>');
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
    if (delta < 0) {
      var sale = { t: Date.now(), id: p.id, name: p.name, price: p.price, cost: p.cost || 0 };
      state.sales.push(sale);
      undoSnapshot.sale = sale;
    }
    save(); render();
    showToast(delta < 0 ? ('Vente · ' + p.name + ' · ' + euro(p.price)) : ('+1 · ' + p.name + ' → ' + p.qty));
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
    var el = e.target.closest('[data-minus],[data-plus],[data-edit],[data-cat-open],[data-back],[data-alerts],[data-sales],[data-period],[data-delsale]');
    if (!el) return;
    if (el.dataset.minus) changeQty(el.dataset.minus, -1);
    else if (el.dataset.plus) changeQty(el.dataset.plus, +1);
    else if (el.dataset.edit) openForm(el.dataset.edit);
    else if (el.dataset.catOpen) { state.view = 'cat'; state.cat = el.dataset.catOpen; render(); window.scrollTo(0, 0); }
    else if (el.dataset.back) goHome();
    else if (el.dataset.alerts) { state.filterAlert = true; render(); window.scrollTo(0, 0); }
    else if (el.dataset.sales) { state.view = 'sales'; render(); window.scrollTo(0, 0); }
    else if (el.dataset.period) { salesPeriod = el.dataset.period; renderSales(); }
    else if (el.dataset.delsale) {
      var parts = el.dataset.delsale.split('_');
      for (var k = 0; k < state.sales.length; k++) {
        if (String(state.sales[k].t) === parts[0] && state.sales[k].id === parts[1]) {
          if (confirm('Supprimer cette vente du journal ?\n(Le stock ne sera pas modifié — utilise + si tu veux remettre l\u2019article en rayon.)')) {
            state.sales.splice(k, 1); save(); renderSales();
          }
          break;
        }
      }
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
  document.querySelectorAll('.overlay').forEach(function (ov) {
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.hasAttribute('data-close')) close(ov);
    });
  });

  var ovForm = $('ovForm'), ovMenu = $('ovMenu');
  $('btnMenu').addEventListener('click', function () { open(ovMenu); });
  $('fab').addEventListener('click', function () { openForm(null); });

  function fillCatSelect(selected) {
    var sel = $('fCat'), cats = allCats(), html = '';
    cats.forEach(function (c) {
      html += '<option' + (c === selected ? ' selected' : '') + '>' + esc(c) + '</option>';
    });
    html += '<option value="__new__">➕ Nouvelle catégorie…</option>';
    sel.innerHTML = html;
  }

  $('fCat').addEventListener('change', function () {
    if (this.value === '__new__') {
      var name = prompt('Nom de la nouvelle catégorie :');
      if (name && name.trim()) {
        var opt = document.createElement('option');
        opt.textContent = name.trim();
        this.insertBefore(opt, this.lastElementChild);
        this.value = name.trim();
      } else {
        this.selectedIndex = 0;
      }
    }
  });

  function openForm(id) {
    editingId = id;
    var p = id ? findP(id) : null;
    $('formTitle').textContent = p ? 'Modifier le produit' : 'Ajouter un produit';
    $('btnDelete').style.display = p ? 'block' : 'none';
    fillCatSelect(p ? p.cat : (state.view === 'cat' && state.cat ? state.cat : undefined));
    $('fName').value = p ? p.name : '';
    $('fBrand').value = p ? p.brand : '';
    $('fQty').value = p ? p.qty : '';
    $('fPrice').value = p ? p.price : '';
    $('fCost').value = (p && p.cost) ? p.cost : '';
    $('fDdm').value = p ? p.ddm : '';
    $('fNote').value = p ? p.note : '';
    updateMarge();
    open(ovForm);
    if (!p) setTimeout(function () { $('fName').focus(); }, 250);
  }

  function updateMarge() {
    var pv = parseFloat(($('fPrice').value || '').replace(',', '.'));
    var pa = parseFloat(($('fCost').value || '').replace(',', '.'));
    var el = $('fMarge');
    if (pv > 0 && pa > 0) {
      var m = pv - pa;
      var pct = Math.round((m / pv) * 100);
      el.textContent = 'Marge : ' + euro(m) + ' (' + pct + ' % du prix de vente)';
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }
  $('fPrice').addEventListener('input', updateMarge);
  $('fCost').addEventListener('input', updateMarge);

  $('btnSave').addEventListener('click', function () {
    var name = $('fName').value.trim();
    var qty = parseInt($('fQty').value, 10);
    if (!name) { alert('Le nom du produit est obligatoire.'); return; }
    if (isNaN(qty) || qty < 0) { alert('Quantité invalide.'); return; }
    var price = parseFloat(($('fPrice').value || '0').replace(',', '.'));
    if (isNaN(price) || price < 0) price = 0;
    var cost = parseFloat(($('fCost').value || '0').replace(',', '.'));
    if (isNaN(cost) || cost < 0) cost = 0;
    var data = {
      cat: $('fCat').value === '__new__' ? 'Divers' : $('fCat').value,
      name: name,
      brand: $('fBrand').value.trim(),
      qty: qty,
      price: price,
      cost: cost,
      ddm: $('fDdm').value.trim(),
      note: $('fNote').value.trim()
    };
    if (editingId) {
      var p = findP(editingId);
      if (p) Object.keys(data).forEach(function (k) { p[k] = data[k]; });
    } else {
      data.id = uid();
      state.products.push(data);
    }
    save(); render(); close(ovForm);
  });

  $('btnDelete').addEventListener('click', function () {
    var p = findP(editingId);
    if (!p) return;
    if (confirm('Supprimer définitivement « ' + p.name + ' » ?')) {
      state.products = state.products.filter(function (x) { return x.id !== editingId; });
      save(); render(); close(ovForm);
    }
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
      JSON.stringify({ v: 1, savedAt: new Date().toISOString(), products: state.products }, null, 1),
      'application/json');
    close(ovMenu);
  });

  $('mExportCsv').addEventListener('click', function () {
    var rows = [['Catégorie', 'Produit', 'Marque', 'Qté', 'Prix achat HT €', 'Prix vente €', 'Valeur vente €', 'DDM', 'Notes']];
    state.products.forEach(function (p) {
      rows.push([p.cat, p.name, p.brand, p.qty,
        (p.cost ? p.cost.toFixed(2).replace('.', ',') : ''),
        p.price.toFixed(2).replace('.', ','),
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
    var rows = [['Date', 'Heure', 'Produit', 'Prix vente €', 'Prix achat €', 'Bénéfice €']];
    state.sales.forEach(function (s) {
      var d = new Date(s.t);
      function z(n) { return (n < 10 ? '0' : '') + n; }
      rows.push([z(d.getDate()) + '/' + z(d.getMonth() + 1) + '/' + d.getFullYear(), z(d.getHours()) + ':' + z(d.getMinutes()),
        s.name, s.price.toFixed(2).replace('.', ','),
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
        if (!confirm('Remplacer le stock actuel par cette sauvegarde (' + d.products.length + ' produits) ?')) return;
        state.products = d.products.map(function (p) {
          return { id: p.id || uid(), cat: p.cat || 'Divers', name: p.name || '?', brand: p.brand || '',
                   qty: Math.max(0, parseInt(p.qty, 10) || 0), price: parseFloat(p.price) || 0, cost: parseFloat(p.cost) || 0,
                   ddm: p.ddm || '', note: p.note || '' };
        });
        state.sales = (d.sales || []).filter(function (s) { return s && s.t && s.name; });
        save(); render(); close(ovMenu);
      } catch (e) { alert('Fichier invalide. Utilise une sauvegarde JSON exportée depuis cette application.'); }
    };
    reader.readAsText(f);
    this.value = '';
  });

  $('mReset').addEventListener('click', function () {
    if (confirm('Tout remplacer par l\u2019inventaire de référence du 13/07/2026 (recomptage gélules inclus) ?\nLes modifications actuelles seront perdues (pense à exporter avant).')) {
      seed(); goHome(); close(ovMenu);
    }
  });

  /* ---------- Démarrage ---------- */
  load();
  render();
})();
