/**
 * Galerie admin — page dediee.
 * Onglets par categorie, reordonnancement, changement de categorie,
 * suppression multiple, upload glisser-deposer, CRUD categories.
 */
(function () {
  "use strict";

  var TOKEN_KEY = "mosquee_admin_jwt";
  var LANG_KEY = "mosquee_admin_lang";
  var token = sessionStorage.getItem(TOKEN_KEY);

  var i18n = {
    fr: {
      navAnnonces: "ANNONCES",
      navGalerie: "GALERIE",
      logout: "Déconnexion",
      pageTitle: "Galerie",
      pageSubtitle: "Organisez les photos affichées sur la page publique de la mosquée.",
      viewPublic: "Voir la galerie publique",
      categoriesTitle: "Catégories",
      manage: "Gérer",
      hide: "Masquer",
      labelCatNom: "Nom de la catégorie",
      catPlaceholder: "Nouvelle catégorie",
      btnAddCat: "Ajouter",
      selectAll: "Tout sélectionner",
      deselectAll: "Tout désélectionner",
      btnDeleteSelected: "Supprimer la sélection",
      btnSaveOrder: "💾 Enregistrer l’ordre",
      btnGlobalSave: "💾 Enregistrer les modifications",
      unsaved: "Modifications non enregistrées",
      uploadTitle: "Ajouter des photos",
      uploadHint: "Glissez vos photos ici ou cliquez pour les choisir",
      uploadFormats: "JPEG, PNG, WebP, AVIF ou GIF — 8 Mo par image",
      uploadInto: "Ajouter dans",
      tabAll: "Toutes",
      tabUncat: "Sans catégorie",
      nonePhoto: "Aucune photo pour le moment. Ajoutez-en avec la zone ci-dessous.",
      noneInTab: "Aucune photo dans cette catégorie.",
      noneCat: "Aucune catégorie. Créez-en une pour organiser la galerie.",
      loading: "Chargement…",
      uploading: "Envoi en cours…",
      saving: "Enregistrement…",
      saved: "Modifications enregistrées.",
      deleted: "Photo supprimée.",
      deletedMany: "Photos supprimées.",
      uploaded: "Photos ajoutées.",
      rename: "Renommer",
      del: "Supprimer",
      moveUp: "Déplacer vers le haut",
      moveDown: "Déplacer vers le bas",
      selectPhoto: "Sélectionner cette photo",
      changeCategory: "Changer de catégorie",
      confirmDeletePhoto: "Supprimer définitivement cette photo ?",
      confirmDeleteMany: "Supprimer définitivement {n} photo(s) ?",
      confirmDeleteCat: "Supprimer cette catégorie ? Les photos qu’elle contient ne seront pas supprimées.",
      photosCount: "{n} photo(s)",
      errNetwork: "Erreur réseau. Réessayez.",
      errGeneric: "Une erreur est survenue.",
      errRejected: "{n} fichier(s) refusé(s).",
      catExists: "Cette catégorie existe déjà.",
      uncategorized: "Sans catégorie",
    },
    ar: {
      navAnnonces: "إعلانات",
      navGalerie: "المعرض",
      logout: "تسجيل الخروج",
      pageTitle: "المعرض",
      pageSubtitle: "نظّم الصور المعروضة في الصفحة العامة للمسجد.",
      viewPublic: "عرض المعرض العام",
      categoriesTitle: "التصنيفات",
      manage: "إدارة",
      hide: "إخفاء",
      labelCatNom: "اسم التصنيف",
      catPlaceholder: "تصنيف جديد",
      btnAddCat: "إضافة",
      selectAll: "تحديد الكل",
      deselectAll: "إلغاء التحديد",
      btnDeleteSelected: "حذف المحدد",
      btnSaveOrder: "💾 حفظ الترتيب",
      btnGlobalSave: "💾 حفظ التعديلات",
      unsaved: "تعديلات غير محفوظة",
      uploadTitle: "إضافة صور",
      uploadHint: "اسحب الصور هنا أو انقر لاختيارها",
      uploadFormats: "JPEG أو PNG أو WebP أو AVIF أو GIF — ٨ ميغابايت للصورة",
      uploadInto: "الإضافة إلى",
      tabAll: "الكل",
      tabUncat: "بدون تصنيف",
      nonePhoto: "لا توجد صور بعد. أضف صورًا من المنطقة أدناه.",
      noneInTab: "لا توجد صور في هذا التصنيف.",
      noneCat: "لا توجد تصنيفات. أنشئ تصنيفًا لتنظيم المعرض.",
      loading: "جاري التحميل…",
      uploading: "جاري الإرسال…",
      saving: "جاري الحفظ…",
      saved: "تم حفظ التعديلات.",
      deleted: "تم حذف الصورة.",
      deletedMany: "تم حذف الصور.",
      uploaded: "تمت إضافة الصور.",
      rename: "إعادة تسمية",
      del: "حذف",
      moveUp: "تحريك لأعلى",
      moveDown: "تحريك لأسفل",
      selectPhoto: "تحديد هذه الصورة",
      changeCategory: "تغيير التصنيف",
      confirmDeletePhoto: "حذف هذه الصورة نهائيًا؟",
      confirmDeleteMany: "حذف {n} صورة نهائيًا؟",
      confirmDeleteCat: "حذف هذا التصنيف؟ لن تُحذف الصور التي يحتويها.",
      photosCount: "{n} صورة",
      errNetwork: "خطأ في الشبكة. حاول مرة أخرى.",
      errGeneric: "حدث خطأ.",
      errRejected: "تم رفض {n} ملف.",
      catExists: "هذا التصنيف موجود بالفعل.",
      uncategorized: "بدون تصنيف",
    },
  };

  var state = {
    lang: "fr",
    photos: [],
    categories: [],
    activeTab: "all",
    selected: Object.create(null),
    dirty: false,
    orderDirty: false,
  };

  function t(key, vars) {
    var dict = i18n[state.lang] || i18n.fr;
    var s = dict[key] || i18n.fr[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.replace("{" + k + "}", vars[k]);
      });
    }
    return s;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- Session ---------- */

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
    var body = options.body;
    if (options.jsonBody) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.jsonBody);
    }
    var r = await fetch(path, { method: options.method || "GET", headers: headers, body: body });
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
      /* la session sera reevaluee au prochain appel */
    }
  }
  // Le JWT vit 2 h : on le renouvelle toutes les 25 min tant que l'onglet est ouvert.
  setInterval(refreshToken, 25 * 60 * 1000);

  /* ---------- Retours visuels ---------- */

  var toastTimer = null;
  function toast(message, isError) {
    var el = $("toast");
    el.textContent = message;
    el.classList.toggle("is-error", !!isError);
    el.classList.add("is-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("is-visible");
    }, 3600);
  }

  function setStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", !!isError);
  }

  function markDirty(orderChanged) {
    state.dirty = true;
    if (orderChanged) state.orderDirty = true;
    $("globalSaveBar").classList.remove("admin-hidden");
    $("btnSaveOrder").classList.toggle("admin-hidden", !state.orderDirty);
  }

  function clearDirty() {
    state.dirty = false;
    state.orderDirty = false;
    $("globalSaveBar").classList.add("admin-hidden");
    $("btnSaveOrder").classList.add("admin-hidden");
  }

  // Filet de securite : on previent avant de perdre un ordre non enregistre.
  window.addEventListener("beforeunload", function (e) {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* ---------- i18n ---------- */

  function applyAdminI18n() {
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-i18n-admin]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-admin");
      if (k) el.textContent = t(k);
    });
    document.querySelectorAll("[data-i18n-admin-ph]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-admin-ph");
      if (k) el.setAttribute("placeholder", t(k));
    });
    document.querySelectorAll("#adminLangSwitch button").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-lang") === state.lang);
    });
  }

  /* ---------- Donnees ---------- */

  function photosOfTab() {
    if (state.activeTab === "all") return state.photos;
    if (state.activeTab === "none") {
      return state.photos.filter(function (p) {
        return !p.category_id;
      });
    }
    return state.photos.filter(function (p) {
      return p.category_id === state.activeTab;
    });
  }

  function selectedNames() {
    return Object.keys(state.selected).filter(function (k) {
      return state.selected[k];
    });
  }

  /* ---------- Rendu ---------- */

  function renderTabs() {
    var tabs = $("photoTabs");
    var counts = { all: state.photos.length, none: 0 };
    state.photos.forEach(function (p) {
      if (!p.category_id) counts.none++;
      else counts[p.category_id] = (counts[p.category_id] || 0) + 1;
    });

    var parts = [tab("all", t("tabAll"), counts.all)];
    state.categories.forEach(function (c) {
      parts.push(tab(c.id, c.nom, counts[c.id] || 0));
    });
    if (counts.none > 0) parts.push(tab("none", t("tabUncat"), counts.none));
    tabs.innerHTML = parts.join("");

    function tab(id, label, n) {
      var active = state.activeTab === id;
      return (
        '<button type="button" role="tab" class="gallery-tab' +
        (active ? " is-active" : "") +
        '" aria-selected="' +
        (active ? "true" : "false") +
        '" data-tab="' +
        escapeHtml(id) +
        '">' +
        escapeHtml(label) +
        '<span class="gallery-tab-count">' +
        n +
        "</span></button>"
      );
    }
  }

  function categoryOptions(selectedId) {
    var out =
      '<option value=""' + (!selectedId ? " selected" : "") + ">" + escapeHtml(t("uncategorized")) + "</option>";
    state.categories.forEach(function (c) {
      out +=
        '<option value="' +
        escapeHtml(c.id) +
        '"' +
        (c.id === selectedId ? " selected" : "") +
        ">" +
        escapeHtml(c.nom) +
        "</option>";
    });
    return out;
  }

  function renderPhotos() {
    var grid = $("photosGrid");
    var list = photosOfTab();

    $("photoCount").textContent = t("photosCount", { n: list.length });

    if (!state.photos.length) {
      grid.innerHTML = '<p class="admin-empty">' + escapeHtml(t("nonePhoto")) + "</p>";
      return;
    }
    if (!list.length) {
      grid.innerHTML = '<p class="admin-empty">' + escapeHtml(t("noneInTab")) + "</p>";
      return;
    }

    grid.innerHTML = list
      .map(function (item, i) {
        var name = escapeHtml(item.name);
        var checked = state.selected[item.name] ? " checked" : "";
        return (
          '<figure class="mosquee-masonry-item admin-photo-card' +
          (state.selected[item.name] ? " is-selected" : "") +
          '" data-name="' +
          name +
          '">' +
          '<div class="mosquee-masonry-inner admin-photo-inner">' +
          (item.url
            ? '<img src="' + escapeHtml(item.url) + '" alt="" loading="lazy" decoding="async" />'
            : '<div class="admin-photo-missing">—</div>') +
          '<label class="admin-photo-check" title="' +
          escapeHtml(t("selectPhoto")) +
          '"><input type="checkbox" class="photo-check" data-name="' +
          name +
          '"' +
          checked +
          ' /><span class="sr-only">' +
          escapeHtml(t("selectPhoto")) +
          "</span></label>" +
          '<div class="admin-photo-controls">' +
          '<button type="button" class="admin-icon-btn photo-up" data-i="' +
          i +
          '" title="' +
          escapeHtml(t("moveUp")) +
          '" aria-label="' +
          escapeHtml(t("moveUp")) +
          '"' +
          (i === 0 ? " disabled" : "") +
          ">⬆</button>" +
          '<button type="button" class="admin-icon-btn photo-down" data-i="' +
          i +
          '" title="' +
          escapeHtml(t("moveDown")) +
          '" aria-label="' +
          escapeHtml(t("moveDown")) +
          '"' +
          (i === list.length - 1 ? " disabled" : "") +
          ">⬇</button>" +
          '<button type="button" class="admin-icon-btn admin-icon-danger photo-trash" data-name="' +
          name +
          '" title="' +
          escapeHtml(t("del")) +
          '" aria-label="' +
          escapeHtml(t("del")) +
          '">🗑</button>' +
          "</div></div>" +
          '<figcaption class="admin-photo-meta">' +
          '<label class="sr-only" for="cat-' +
          i +
          '">' +
          escapeHtml(t("changeCategory")) +
          "</label>" +
          '<select id="cat-' +
          i +
          '" class="photo-cat-select" data-name="' +
          name +
          '" title="' +
          escapeHtml(t("changeCategory")) +
          '">' +
          categoryOptions(item.category_id) +
          "</select></figcaption></figure>"
        );
      })
      .join("");
  }

  function renderCategories() {
    var root = $("categoriesList");
    if (!state.categories.length) {
      root.innerHTML = '<li class="admin-empty-inline">' + escapeHtml(t("noneCat")) + "</li>";
    } else {
      root.innerHTML = state.categories
        .map(function (c) {
          var n = state.photos.filter(function (p) {
            return p.category_id === c.id;
          }).length;
          return (
            '<li class="admin-cat-item">' +
            '<span class="admin-cat-name">' +
            escapeHtml(c.nom) +
            '<span class="admin-cat-count">' +
            n +
            "</span></span>" +
            '<span class="admin-inline-btns">' +
            '<button type="button" class="admin-link-btn cat-rename" data-id="' +
            escapeHtml(c.id) +
            '" data-nom="' +
            escapeHtml(c.nom) +
            '">' +
            escapeHtml(t("rename")) +
            "</button>" +
            '<button type="button" class="admin-link-btn is-danger cat-delete" data-id="' +
            escapeHtml(c.id) +
            '">' +
            escapeHtml(t("del")) +
            "</button>" +
            "</span></li>"
          );
        })
        .join("");
    }

    var sel = $("uploadCategory");
    var previous = sel.value;
    sel.innerHTML = categoryOptions(null);
    if (previous) sel.value = previous;
    $("uploadTargetWrap").classList.toggle("admin-hidden", !state.categories.length);
  }

  function renderAll() {
    renderTabs();
    renderCategories();
    renderPhotos();
    updateSelectionUi();
  }

  function updateSelectionUi() {
    var n = selectedNames().length;
    $("btnDeleteSelected").classList.toggle("admin-hidden", n === 0);
    $("btnDeleteSelected").textContent = n ? t("btnDeleteSelected") + " (" + n + ")" : t("btnDeleteSelected");
    var visible = photosOfTab();
    var allSelected =
      visible.length > 0 &&
      visible.every(function (p) {
        return state.selected[p.name];
      });
    $("btnSelectAll").textContent = allSelected ? t("deselectAll") : t("selectAll");
  }

  /* ---------- Chargement ---------- */

  async function loadAll() {
    $("photosGrid").innerHTML = '<p class="admin-empty">' + escapeHtml(t("loading")) + "</p>";
    try {
      var res = await api("/api/photos");
      if (!res.ok) {
        $("photosGrid").innerHTML =
          '<p class="admin-empty is-error">' + escapeHtml((res.data && res.data.error) || t("errGeneric")) + "</p>";
        return;
      }
      state.photos = res.data.items || [];
      state.categories = res.data.categories || [];
      state.selected = Object.create(null);
      clearDirty();
      renderAll();
    } catch (e) {
      if (e.message !== "unauthorized") {
        $("photosGrid").innerHTML = '<p class="admin-empty is-error">' + escapeHtml(t("errNetwork")) + "</p>";
      }
    }
  }

  /* ---------- Reordonnancement ---------- */

  /**
   * Deplace une photo dans l'onglet courant. On permute avec la voisine
   * visible, puis on repercute l'echange dans la liste complete pour que
   * l'ordre enregistre corresponde a ce qui est affiche.
   */
  function movePhoto(visibleIndex, dir) {
    var visible = photosOfTab();
    var target = visibleIndex + dir;
    if (target < 0 || target >= visible.length) return;

    var a = state.photos.indexOf(visible[visibleIndex]);
    var b = state.photos.indexOf(visible[target]);
    if (a < 0 || b < 0) return;

    var tmp = state.photos[a];
    state.photos[a] = state.photos[b];
    state.photos[b] = tmp;

    markDirty(true);
    renderPhotos();
  }

  async function saveAll() {
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
    if (!res.ok) throw new Error((res.data && res.data.error) || "save_failed");
    clearDirty();
  }

  async function handleSave() {
    setStatus($("photoStatus"), t("saving"));
    try {
      await saveAll();
      setStatus($("photoStatus"), "");
      toast(t("saved"));
      await loadAll();
    } catch (e) {
      if (e.message === "unauthorized") return;
      setStatus($("photoStatus"), t("errGeneric"), true);
      toast(t("errGeneric"), true);
    }
  }

  /* ---------- Upload ---------- */

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve({
          filename: file.name || "image.jpg",
          contentType: file.type || "image/jpeg",
          data: String(reader.result || ""),
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) {
      return f && /^image\//.test(f.type);
    });
    if (!files.length) return;

    var status = $("photoStatus");
    var progress = $("uploadProgress");
    var bar = $("uploadProgressBar");
    progress.classList.remove("admin-hidden");
    bar.style.width = "0%";
    setStatus(status, t("uploading"));

    try {
      var payload = [];
      for (var i = 0; i < files.length; i++) {
        payload.push(await fileToBase64(files[i]));
        // La barre suit la lecture locale : c'est la phase la plus longue
        // quand on depose beaucoup d'images.
        bar.style.width = Math.round(((i + 1) / files.length) * 90) + "%";
      }

      var res = await api("/api/photos", {
        method: "POST",
        jsonBody: { files: payload, category_id: $("uploadCategory").value || null },
      });
      bar.style.width = "100%";

      if (!res.ok) {
        setStatus(status, (res.data && res.data.error) || t("errGeneric"), true);
        toast((res.data && res.data.error) || t("errGeneric"), true);
        return;
      }

      var rejected = (res.data && res.data.rejected) || [];
      setStatus(status, "");
      if (rejected.length) {
        toast(t("uploaded") + " " + t("errRejected", { n: rejected.length }), true);
      } else {
        toast(t("uploaded"));
      }
      await loadAll();
    } catch (e) {
      if (e.message !== "unauthorized") {
        setStatus(status, t("errNetwork"), true);
        toast(t("errNetwork"), true);
      }
    } finally {
      setTimeout(function () {
        progress.classList.add("admin-hidden");
        bar.style.width = "0%";
      }, 600);
      $("photoInput").value = "";
    }
  }

  /* ---------- Evenements ---------- */

  $("photoTabs").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-tab]");
    if (!btn) return;
    state.activeTab = btn.getAttribute("data-tab");
    renderTabs();
    renderPhotos();
    updateSelectionUi();
  });

  $("photosGrid").addEventListener("click", async function (e) {
    var up = e.target.closest(".photo-up");
    var down = e.target.closest(".photo-down");
    var trash = e.target.closest(".photo-trash");

    if (up) return movePhoto(Number(up.getAttribute("data-i")), -1);
    if (down) return movePhoto(Number(down.getAttribute("data-i")), 1);

    if (trash) {
      var name = trash.getAttribute("data-name");
      if (!window.confirm(t("confirmDeletePhoto"))) return;
      try {
        var res = await api("/api/photos?name=" + encodeURIComponent(name), { method: "DELETE" });
        if (!res.ok) {
          toast((res.data && res.data.error) || t("errGeneric"), true);
          return;
        }
        toast(t("deleted"));
        await loadAll();
      } catch (err) {
        if (err.message !== "unauthorized") toast(t("errNetwork"), true);
      }
    }
  });

  $("photosGrid").addEventListener("change", function (e) {
    if (e.target.classList.contains("photo-check")) {
      var n = e.target.getAttribute("data-name");
      state.selected[n] = !!e.target.checked;
      var card = e.target.closest(".admin-photo-card");
      if (card) card.classList.toggle("is-selected", !!e.target.checked);
      updateSelectionUi();
      return;
    }
    if (e.target.classList.contains("photo-cat-select")) {
      var name = e.target.getAttribute("data-name");
      var photo = state.photos.find(function (p) {
        return p.name === name;
      });
      if (!photo) return;
      photo.category_id = e.target.value || null;
      markDirty(false);
      renderTabs();
      renderCategories();
    }
  });

  $("btnSelectAll").addEventListener("click", function () {
    var visible = photosOfTab();
    var allSelected =
      visible.length > 0 &&
      visible.every(function (p) {
        return state.selected[p.name];
      });
    visible.forEach(function (p) {
      state.selected[p.name] = !allSelected;
    });
    renderPhotos();
    updateSelectionUi();
  });

  $("btnDeleteSelected").addEventListener("click", async function () {
    var names = selectedNames();
    if (!names.length) return;
    if (!window.confirm(t("confirmDeleteMany", { n: names.length }))) return;
    try {
      var res = await api("/api/photos", {
        method: "POST",
        jsonBody: { action: "deleteMany", names: names },
      });
      if (!res.ok) {
        toast((res.data && res.data.error) || t("errGeneric"), true);
        return;
      }
      toast(t("deletedMany"));
      await loadAll();
    } catch (e) {
      if (e.message !== "unauthorized") toast(t("errNetwork"), true);
    }
  });

  $("btnSaveOrder").addEventListener("click", handleSave);
  $("btnGlobalSave").addEventListener("click", handleSave);

  /* Upload : clic, glisser-deposer et collage */

  $("photoInput").addEventListener("change", function () {
    if (this.files && this.files.length) uploadFiles(this.files);
  });

  var dropZone = $("dropZone");
  ["dragenter", "dragover"].forEach(function (ev) {
    dropZone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropZone.classList.add("is-dragover");
    });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    dropZone.addEventListener(ev, function (e) {
      e.preventDefault();
      if (ev === "dragleave" && dropZone.contains(e.relatedTarget)) return;
      dropZone.classList.remove("is-dragover");
    });
  });
  dropZone.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      uploadFiles(e.dataTransfer.files);
    }
  });
  // Le navigateur ouvrirait l'image a la place de la page si on lachait a cote.
  window.addEventListener("dragover", function (e) {
    e.preventDefault();
  });
  window.addEventListener("drop", function (e) {
    e.preventDefault();
  });

  document.addEventListener("paste", function (e) {
    if (!e.clipboardData || !e.clipboardData.files || !e.clipboardData.files.length) return;
    uploadFiles(e.clipboardData.files);
  });

  /* Categories */

  $("btnToggleCats").addEventListener("click", function () {
    var panel = $("catPanel");
    var open = panel.hasAttribute("hidden");
    if (open) panel.removeAttribute("hidden");
    else panel.setAttribute("hidden", "");
    this.setAttribute("aria-expanded", open ? "true" : "false");
    this.querySelector("span").textContent = open ? t("hide") : t("manage");
  });

  $("catForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var input = $("catNom");
    var nom = input.value.trim();
    if (!nom) return;

    var exists = state.categories.some(function (c) {
      return c.nom.toLowerCase() === nom.toLowerCase();
    });
    if (exists) {
      setStatus($("catStatus"), t("catExists"), true);
      return;
    }

    setStatus($("catStatus"), t("saving"));
    try {
      var res = await api("/api/categories", { method: "POST", jsonBody: { nom: nom } });
      if (!res.ok) {
        setStatus($("catStatus"), (res.data && res.data.error) || t("errGeneric"), true);
        return;
      }
      input.value = "";
      setStatus($("catStatus"), "");
      toast(t("saved"));
      await loadAll();
    } catch (err) {
      if (err.message !== "unauthorized") setStatus($("catStatus"), t("errNetwork"), true);
    }
  });

  $("categoriesList").addEventListener("click", async function (e) {
    var ren = e.target.closest(".cat-rename");
    var del = e.target.closest(".cat-delete");

    if (ren) {
      var next = window.prompt(t("rename"), ren.getAttribute("data-nom") || "");
      if (next === null) return;
      next = next.trim();
      if (!next) return;
      try {
        var r1 = await api("/api/categories", {
          method: "PUT",
          jsonBody: { id: ren.getAttribute("data-id"), nom: next },
        });
        if (!r1.ok) {
          toast((r1.data && r1.data.error) || t("errGeneric"), true);
          return;
        }
        toast(t("saved"));
        await loadAll();
      } catch (err) {
        if (err.message !== "unauthorized") toast(t("errNetwork"), true);
      }
      return;
    }

    if (del) {
      if (!window.confirm(t("confirmDeleteCat"))) return;
      try {
        var r2 = await api("/api/categories", {
          method: "DELETE",
          jsonBody: { id: del.getAttribute("data-id") },
        });
        if (!r2.ok) {
          toast((r2.data && r2.data.error) || t("errGeneric"), true);
          return;
        }
        if (state.activeTab === del.getAttribute("data-id")) state.activeTab = "all";
        toast(t("saved"));
        await loadAll();
      } catch (err) {
        if (err.message !== "unauthorized") toast(t("errNetwork"), true);
      }
    }
  });

  /* Langue et deconnexion */

  $("adminLangSwitch").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-lang]");
    if (!btn) return;
    state.lang = btn.getAttribute("data-lang") === "ar" ? "ar" : "fr";
    try {
      localStorage.setItem(LANG_KEY, state.lang);
    } catch (err) {}
    applyAdminI18n();
    renderAll();
  });

  $("logoutBtn").addEventListener("click", function () {
    state.dirty = false;
    sessionStorage.removeItem(TOKEN_KEY);
    window.location.href = "/admin.html";
  });

  var navToggle = document.querySelector(".nh-nav-toggle");
  if (navToggle) {
    navToggle.addEventListener("click", function () {
      var list = document.querySelector(".nh-nav-list");
      var open = list.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* ---------- Demarrage ---------- */

  try {
    var savedLang = localStorage.getItem(LANG_KEY);
    if (savedLang === "ar" || savedLang === "fr") state.lang = savedLang;
  } catch (e) {}
  applyAdminI18n();
  loadAll();
})();
