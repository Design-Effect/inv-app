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
  var state = { products: [], view: 'home', cat: null, filterAlert: false, query: '' };
  var editingId = null;
  var undoSnapshot = null, undoTimer = null;

  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function load() {
    var raw = storage.get(KEY);
    if (raw) {
      try {
        var d = JSON.parse(raw);
        if (d && d.products && d.products.length) { state.products = d.products; return; }
      } catch (e) {}
    }
    seed();
  }

  function seed() {
    state.products = SEED_DATA.map(function (p) {
      return { id: uid(), cat: p.cat, name: p.name, brand: p.brand, qty: p.qty, price: p.price, cost: p.cost || 0, ddm: p.ddm, note: p.note };
    });
    save();
  }

  function save() {
    storage.set(KEY, JSON.stringify({ v: 1, savedAt: new Date().toISOString(), products: state.products }));
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

  function renderProducts(items, title, grouped) {
    var html = '<div class="backbar"><button data-back="1">← Catégories</button><h3>' + esc(title) +
      ' <em>' + items.length + '</em></h3></div>';
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
    } else if (state.view === 'cat' && state.cat) {
      renderProducts(state.products.filter(function (p) { return (p.cat || 'Divers') === state.cat; }), state.cat, false);
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
    undoSnapshot = { id: id, qty: p.qty };
    p.qty = next;
    save(); render();
    showToast((delta < 0 ? '−1 · ' : '+1 · ') + p.name + ' → ' + p.qty);
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
      if (p) { p.qty = undoSnapshot.qty; save(); render(); }
      undoSnapshot = null;
    }
    $('toast').classList.remove('show');
  });

  /* ---------- Délégation clics ---------- */
  listEl.addEventListener('click', function (e) {
    var el = e.target.closest('[data-minus],[data-plus],[data-edit],[data-cat-open],[data-back],[data-alerts]');
    if (!el) return;
    if (el.dataset.minus) changeQty(el.dataset.minus, -1);
    else if (el.dataset.plus) changeQty(el.dataset.plus, +1);
    else if (el.dataset.edit) openForm(el.dataset.edit);
    else if (el.dataset.catOpen) { state.view = 'cat'; state.cat = el.dataset.catOpen; render(); window.scrollTo(0, 0); }
    else if (el.dataset.back) goHome();
    else if (el.dataset.alerts) { state.filterAlert = true; render(); window.scrollTo(0, 0); }
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
