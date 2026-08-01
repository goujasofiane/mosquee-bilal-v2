(function () {
  var TOKEN_KEY = "mosquee_admin_jwt";
  var LANG_KEY = "mosquee_admin_lang";
  var token = sessionStorage.getItem(TOKEN_KEY);

  var i18n = {
    fr: {
      navAnnonces: "ANNONCES",
      navGalerie: "GALERIE",
      navCategories: "CATÉGORIES",
      logout: "Déconnexion",
      title: "Dashboard admin",
      subtitle: "Gérez les annonces, les photos et les catégories.",
      annoncesTitle: "Annonces",
      labelTitre: "Titre",
      labelTexte: "Texte",
      labelPolice: "Police",
      labelCouleur: "Couleur du texte",
      labelFichiers: "Pièces jointes (PDF, images)",
      btnAddAnnonce: "Ajouter l’annonce",
      annoncesList: "Annonces existantes",
      categoriesTitle: "Catégories",
      labelCatNom: "Nom de la catégorie",
      btnAddCat: "Ajouter",
      photosTitle: "Gestion des photos",
      photosHint: "Grille comme la galerie publique. Réordonnez, changez la catégorie, puis enregistrez.",
      btnDeleteSelected: "Supprimer la sélection",
      btnSaveOrder: "Enregistrer l’ordre",
      uploadHint: "Ajouter des photos (sélection multiple)",
      btnGlobalSave: "💾 Enregistrer les modifications",
      noneAnnonce: "Aucune annonce.",
      nonePhoto: "Aucune photo",
      delete: "Supprimer",
      rename: "Renommer",
      confirmDelete: "Confirmer la suppression ?",
      saved: "Modifications enregistrées.",
      loading: "Chargement…",
    },
    ar: {
      navAnnonces: "إعلانات",
      navGalerie: "المعرض",
      navCategories: "التصنيفات",
      logout: "تسجيل الخروج",
      title: "لوحة الإدارة",
      subtitle: "إدارة الإعلانات والصور والتصنيفات.",
      annoncesTitle: "الإعلانات",
      labelTitre: "العنوان",
      labelTexte: "النص",
      labelPolice: "الخط",
      labelCouleur: "لون النص",
      labelFichiers: "مرفقات (PDF، صور)",
      btnAddAnnonce: "إضافة إعلان",
      annoncesList: "الإعلانات الحالية",
      categoriesTitle: "التصنيفات",
      labelCatNom: "اسم التصنيف",
      btnAddCat: "إضافة",
      photosTitle: "إدارة الصور",
      photosHint: "شبكة كالمعرض العام. أعد الترتيب أو غيّر التصنيف ثم احفظ.",
      btnDeleteSelected: "حذف المحدد",
      btnSaveOrder: "حفظ الترتيب",
      uploadHint: "إضافة صور (اختيار متعدد)",
      btnGlobalSave: "💾 حفظ التعديلات",
      noneAnnonce: "لا توجد إعلانات.",
      nonePhoto: "لا توجد صور",
      delete: "حذف",
      rename: "إعادة تسمية",
      confirmDelete: "تأكيد الحذف؟",
      saved: "تم حفظ التعديلات.",
      loading: "جاري التحميل…",
    },
  };

  var state = {
    lang: "fr",
    photos: [],
    categories: [],
    orderDirty: false,
    categoryDirty: false,
    selected: {},
  };

  var COLORS = ["#f5f0e1", "#c9a84c", "#ffffff", "#2d6a4f", "#e8d5a3", "#ff9f9f", "#93f4ce", "#7eb6ff"];

  function t(key) {
    return (i18n[state.lang] && i18n[state.lang][key]) || i18n.fr[key] || key;
  }

  function applyAdminI18n() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n-admin]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-admin");
      if (k) el.textContent = t(k);
    });
    document.querySelectorAll("#adminLangSwitch button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-lang") === state.lang);
    });
  }

  function markDirty() {
    document.getElementById("globalSaveBar").classList.remove("admin-hidden");
    if (state.orderDirty) document.getElementById("btnSaveOrder").classList.remove("admin-hidden");
  }

  function clearDirty() {
    state.orderDirty = false;
    state.categoryDirty = false;
    document.getElementById("globalSaveBar").classList.add("admin-hidden");
    document.getElementById("btnSaveOrder").classList.add("admin-hidden");
  }

  function updateSelectionUi() {
    var n = Object.keys(state.selected).filter(function (k) {
      return state.selected[k];
    }).length;
    document.getElementById("btnDeleteSelected").classList.toggle("admin-hidden", n === 0);
  }

  function redirectLogin() {
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.replace("/admin.html");
  }

  if (!token) {
    redirectLogin();
    return;
  }

  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    headers.Authorization = "Bearer " + token;
    if (options.jsonBody) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(options.jsonBody);
    }
    var r = await fetch(path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body,
    });
    var data = await r.json().catch(function () {
      return {};
    });
    if (r.status === 401) {
      redirectLogin();
      throw new Error("unauthorized");
    }
    return { ok: r.ok, status: r.status, data: data };
  }

  async function refreshToken() {
    try {
      var res = await api("/api/refresh", { method: "POST", jsonBody: {} });
      if (res.ok && res.data.token) {
        token = res.data.token;
        sessionStorage.setItem(TOKEN_KEY, token);
      }
    } catch (e) {
      /* */
    }
  }

  setInterval(refreshToken, 20 * 60 * 1000);
  ["click", "keydown", "scroll"].forEach(function (ev) {
    window.addEventListener(
      ev,
      function () {
        if (!window.__mosqueeRefreshScheduled) {
          window.__mosqueeRefreshScheduled = true;
          setTimeout(function () {
            window.__mosqueeRefreshScheduled = false;
            refreshToken();
          }, 60000);
        }
      },
      { passive: true }
    );
  });

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve({
          filename: file.name || "file",
          contentType: file.type || "application/octet-stream",
          data: String(reader.result || ""),
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* —— Annonces —— */
  async function loadAnnonces() {
    var listEl = document.getElementById("annoncesList");
    listEl.innerHTML = "<p class='nh-text'>" + t("loading") + "</p>";
    var res = await api("/api/annonces?files=1");
    if (!res.ok) {
      listEl.innerHTML = "<p class='admin-status-inline is-error'>Erreur</p>";
      return;
    }
    var items = res.data.items || [];
    if (!items.length) {
      listEl.innerHTML = "<p class='nh-text' style='color:rgba(245,240,228,0.55)'>" + t("noneAnnonce") + "</p>";
      return;
    }
    listEl.innerHTML = items
      .map(function (item) {
        var style =
          "font-family:" +
          escapeHtml(item.police || "Cairo") +
          ";color:" +
          escapeHtml(item.couleur || "#f5f0e1");
        return (
          "<article class='annonce-admin-item'>" +
          "<div style='" +
          style +
          "'>" +
          "<h3 class='annonce-card-title' style='color:inherit;font-family:inherit'>" +
          escapeHtml(item.titre) +
          "</h3>" +
          "<p class='annonce-card-text' style='color:inherit;font-family:inherit'>" +
          escapeHtml(item.texte) +
          "</p>" +
          "</div>" +
          "<button type='button' class='admin-btn-delete annonce-delete-btn' data-id='" +
          escapeHtml(item.id) +
          "'>" +
          t("delete") +
          "</button>" +
          "</article>"
        );
      })
      .join("");
  }

  /* —— Catégories —— */
  async function loadCategories() {
    var res = await api("/api/categories");
    state.categories = res.ok ? res.data.items || [] : [];
    var root = document.getElementById("categoriesList");
    if (!state.categories.length) {
      root.innerHTML = "<p class='nh-text' style='color:rgba(245,240,228,0.55)'>—</p>";
      return;
    }
    root.innerHTML = state.categories
      .map(function (c) {
        return (
          "<article class='annonce-admin-item' data-cat='" +
          escapeHtml(c.id) +
          "'>" +
          "<div><strong style='color:#c9a84c'>" +
          escapeHtml(c.nom) +
          "</strong></div>" +
          "<div class='admin-inline-btns'>" +
          "<button type='button' class='nh-btn nh-btn-outline cat-rename-btn' data-id='" +
          escapeHtml(c.id) +
          "' data-nom='" +
          escapeHtml(c.nom) +
          "'>" +
          t("rename") +
          "</button>" +
          "<button type='button' class='admin-btn-delete cat-delete-btn' data-id='" +
          escapeHtml(c.id) +
          "'>" +
          t("delete") +
          "</button>" +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function categoryOptions(selectedId) {
    return state.categories
      .map(function (c) {
        return (
          "<option value='" +
          escapeHtml(c.id) +
          "'" +
          (c.id === selectedId ? " selected" : "") +
          ">" +
          escapeHtml(c.nom) +
          "</option>"
        );
      })
      .join("");
  }

  /* —— Photos —— */
  async function loadPhotos() {
    var grid = document.getElementById("photosGrid");
    grid.innerHTML = "<p class='nh-text'>" + t("loading") + "</p>";
    var res = await api("/api/photos");
    if (!res.ok) {
      grid.innerHTML =
        "<p class='admin-status-inline is-error'>" +
        escapeHtml((res.data && res.data.error) || "Erreur") +
        "</p>";
      return;
    }
    state.photos = res.data.items || [];
    state.selected = {};
    updateSelectionUi();
    renderPhotos();
  }

  function renderPhotos() {
    var grid = document.getElementById("photosGrid");
    if (!state.photos.length) {
      grid.innerHTML =
        "<p class='nh-text admin-photos-empty' style='color:rgba(245,240,228,0.55)'>" + t("nonePhoto") + "</p>";
      return;
    }
    grid.innerHTML = state.photos
      .map(function (item, index) {
        var enc = encodeURIComponent(item.name);
        var checked = state.selected[item.name] ? " checked" : "";
        return (
          "<figure class='mosquee-masonry-item admin-photo-card' data-name='" +
          enc +
          "' data-index='" +
          index +
          "'>" +
          "<div class='mosquee-masonry-inner admin-photo-inner'>" +
          (item.url
            ? "<img src='" + escapeHtml(item.url) + "' alt='' loading='lazy' />"
            : "<div class='admin-photo-missing'>—</div>") +
          "<label class='admin-photo-check'><input type='checkbox' class='photo-check' data-name='" +
          enc +
          "'" +
          checked +
          " /></label>" +
          "<div class='admin-photo-controls'>" +
          "<button type='button' class='admin-icon-btn photo-up' data-index='" +
          index +
          "' title='Up'>⬆</button>" +
          "<button type='button' class='admin-icon-btn photo-down' data-index='" +
          index +
          "' title='Down'>⬇</button>" +
          "<button type='button' class='admin-icon-btn photo-trash' data-name='" +
          enc +
          "' title='Delete'>🗑</button>" +
          "</div>" +
          "</div>" +
          "<div class='admin-photo-meta'>" +
          "<select class='photo-cat-select' data-name='" +
          enc +
          "'>" +
          categoryOptions(item.category_id) +
          "</select>" +
          "</div>" +
          "</figure>"
        );
      })
      .join("");
  }

  function movePhoto(index, dir) {
    var j = index + dir;
    if (j < 0 || j >= state.photos.length) return;
    var tmp = state.photos[index];
    state.photos[index] = state.photos[j];
    state.photos[j] = tmp;
    state.orderDirty = true;
    markDirty();
    renderPhotos();
  }

  async function saveAllChanges() {
    var order = state.photos.map(function (p) {
      return p.name;
    });
    var assignments = state.photos.map(function (p) {
      return { name: p.name, category_id: p.category_id || null };
    });
    var res = await api("/api/photos", {
      method: "POST",
      jsonBody: { action: "saveAll", order: order, assignments: assignments },
    });
    if (!res.ok) throw new Error(res.data.error || "save failed");
    clearDirty();
  }

  /* —— Init UI —— */
  var palette = document.getElementById("colorPalette");
  COLORS.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "admin-color-swatch";
    b.style.background = c;
    b.setAttribute("data-color", c);
    b.addEventListener("click", function () {
      document.getElementById("couleur").value = c;
      document.getElementById("texte").style.color = c;
    });
    palette.appendChild(b);
  });

  document.getElementById("police").addEventListener("change", function () {
    document.getElementById("texte").style.fontFamily = this.value;
  });
  document.getElementById("couleur").addEventListener("input", function () {
    document.getElementById("texte").style.color = this.value;
  });

  document.getElementById("adminLangSwitch").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-lang]");
    if (!btn) return;
    state.lang = btn.getAttribute("data-lang") === "ar" ? "ar" : "fr";
    try {
      localStorage.setItem(LANG_KEY, state.lang);
    } catch (err) {}
    applyAdminI18n();
    renderPhotos();
    loadAnnonces();
    loadCategories();
  });

  try {
    var saved = localStorage.getItem(LANG_KEY);
    if (saved === "ar" || saved === "fr") state.lang = saved;
  } catch (e) {}
  applyAdminI18n();

  document.getElementById("annonceForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var status = document.getElementById("formStatus");
    setStatus(status, t("loading"));
    try {
      var fichiers = [];
      var input = document.getElementById("annonceFiles");
      if (input.files && input.files.length) {
        for (var i = 0; i < input.files.length; i++) {
          fichiers.push(await fileToBase64(input.files[i]));
        }
      }
      var res = await api("/api/annonces", {
        method: "POST",
        jsonBody: {
          titre: document.getElementById("titre").value.trim(),
          texte: document.getElementById("texte").value.trim(),
          police: document.getElementById("police").value,
          couleur: document.getElementById("couleur").value,
          fichiers: fichiers,
        },
      });
      if (!res.ok) {
        setStatus(status, res.data.error || "Erreur", true);
        return;
      }
      e.target.reset();
      document.getElementById("texte").style.fontFamily = "";
      document.getElementById("texte").style.color = "";
      setStatus(status, t("saved"));
      await loadAnnonces();
    } catch (err) {
      if (err.message !== "unauthorized") setStatus(status, "Erreur réseau", true);
    }
  });

  document.getElementById("annoncesList").addEventListener("click", async function (e) {
    var btn = e.target.closest(".annonce-delete-btn");
    if (!btn) return;
    if (!window.confirm(t("confirmDelete"))) return;
    await api("/api/annonces?id=" + encodeURIComponent(btn.getAttribute("data-id")), { method: "DELETE" });
    await loadAnnonces();
  });

  document.getElementById("catForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var nom = document.getElementById("catNom").value.trim();
    if (!nom) return;
    await api("/api/categories", { method: "POST", jsonBody: { nom: nom } });
    document.getElementById("catNom").value = "";
    await loadCategories();
    renderPhotos();
  });

  document.getElementById("categoriesList").addEventListener("click", async function (e) {
    var ren = e.target.closest(".cat-rename-btn");
    var del = e.target.closest(".cat-delete-btn");
    if (ren) {
      var next = window.prompt(t("rename"), ren.getAttribute("data-nom") || "");
      if (!next || !next.trim()) return;
      await api("/api/categories", {
        method: "PUT",
        jsonBody: { id: ren.getAttribute("data-id"), nom: next.trim() },
      });
      await loadCategories();
      renderPhotos();
    }
    if (del) {
      if (!window.confirm(t("confirmDelete"))) return;
      await api("/api/categories", {
        method: "DELETE",
        jsonBody: { id: del.getAttribute("data-id") },
      });
      await loadCategories();
      await loadPhotos();
    }
  });

  document.getElementById("photosGrid").addEventListener("click", async function (e) {
    var up = e.target.closest(".photo-up");
    var down = e.target.closest(".photo-down");
    var trash = e.target.closest(".photo-trash");
    if (up) movePhoto(Number(up.getAttribute("data-index")), -1);
    if (down) movePhoto(Number(down.getAttribute("data-index")), 1);
    if (trash) {
      var name = decodeURIComponent(trash.getAttribute("data-name"));
      if (!window.confirm(t("confirmDelete"))) return;
      await api("/api/photos?name=" + encodeURIComponent(name), { method: "DELETE" });
      await loadPhotos();
    }
  });

  document.getElementById("photosGrid").addEventListener("change", function (e) {
    if (e.target.classList.contains("photo-check")) {
      var name = decodeURIComponent(e.target.getAttribute("data-name"));
      state.selected[name] = !!e.target.checked;
      updateSelectionUi();
    }
    if (e.target.classList.contains("photo-cat-select")) {
      var n = decodeURIComponent(e.target.getAttribute("data-name"));
      var photo = state.photos.find(function (p) {
        return p.name === n;
      });
      if (photo) {
        photo.category_id = e.target.value || null;
        state.categoryDirty = true;
        markDirty();
      }
    }
  });

  document.getElementById("btnDeleteSelected").addEventListener("click", async function () {
    var names = Object.keys(state.selected).filter(function (k) {
      return state.selected[k];
    });
    if (!names.length || !window.confirm(t("confirmDelete"))) return;
    await api("/api/photos", { method: "POST", jsonBody: { action: "deleteMany", names: names } });
    await loadPhotos();
  });

  document.getElementById("btnSaveOrder").addEventListener("click", async function () {
    try {
      await saveAllChanges();
      setStatus(document.getElementById("photoStatus"), t("saved"));
    } catch (e) {
      setStatus(document.getElementById("photoStatus"), "Erreur", true);
    }
  });

  document.getElementById("btnGlobalSave").addEventListener("click", async function () {
    try {
      await saveAllChanges();
      setStatus(document.getElementById("photoStatus"), t("saved"));
    } catch (e) {
      setStatus(document.getElementById("photoStatus"), "Erreur", true);
    }
  });

  document.getElementById("photoInput").addEventListener("change", async function () {
    var files = this.files;
    if (!files || !files.length) return;
    setStatus(document.getElementById("photoStatus"), t("loading"));
    try {
      var payload = [];
      for (var i = 0; i < files.length; i++) payload.push(await fileToBase64(files[i]));
      var res = await api("/api/photos", { method: "POST", jsonBody: { files: payload } });
      if (!res.ok) {
        setStatus(document.getElementById("photoStatus"), res.data.error || "Erreur", true);
        return;
      }
      this.value = "";
      setStatus(document.getElementById("photoStatus"), t("saved"));
      await loadPhotos();
    } catch (err) {
      if (err.message !== "unauthorized") setStatus(document.getElementById("photoStatus"), "Erreur réseau", true);
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", function () {
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.href = "/admin.html";
  });

  api("/api/annonces", { method: "POST", jsonBody: { action: "verify" } })
    .then(function (res) {
      if (!res.ok) throw new Error("unauthorized");
      return Promise.all([loadCategories(), loadAnnonces(), loadPhotos()]);
    })
    .catch(function () {
      redirectLogin();
    });
})();
