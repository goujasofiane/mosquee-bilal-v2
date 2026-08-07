/**
 * Tableau de bord admin — annonces.
 * La gestion de la galerie vit desormais dans admin/photos.html.
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
      pageTitle: "Annonces",
      pageSubtitle: "Publiez les informations affichées sur l’accueil et la page Annonces.",
      goGallery: "Gérer la galerie",
      newAnnonce: "Nouvelle annonce",
      labelTitre: "Titre",
      labelTexte: "Texte",
      labelPolice: "Police",
      labelCouleur: "Couleur du texte",
      labelFichiers: "Pièces jointes (PDF, images)",
      filesHint: "PDF, JPEG, PNG, GIF ou WebP — 10 Mo par fichier, 10 fichiers maximum.",
      preview: "Aperçu",
      previewTitle: "Titre de l’annonce",
      previewText: "Le texte de votre annonce apparaîtra ici.",
      btnAddAnnonce: "Publier l’annonce",
      annoncesList: "Annonces publiées",
      annoncesCount: "{n} annonce(s)",
      noneAnnonce: "Aucune annonce publiée pour le moment.",
      del: "Supprimer",
      files: "{n} pièce(s) jointe(s)",
      confirmDelete: "Supprimer définitivement cette annonce ?",
      loading: "Chargement…",
      publishing: "Publication…",
      published: "Annonce publiée.",
      deleted: "Annonce supprimée.",
      errGeneric: "Une erreur est survenue.",
      errNetwork: "Erreur réseau. Réessayez.",
    },
    ar: {
      navAnnonces: "إعلانات",
      navGalerie: "المعرض",
      logout: "تسجيل الخروج",
      pageTitle: "الإعلانات",
      pageSubtitle: "انشر المعلومات المعروضة في الصفحة الرئيسية وصفحة الإعلانات.",
      goGallery: "إدارة المعرض",
      newAnnonce: "إعلان جديد",
      labelTitre: "العنوان",
      labelTexte: "النص",
      labelPolice: "الخط",
      labelCouleur: "لون النص",
      labelFichiers: "مرفقات (PDF، صور)",
      filesHint: "PDF أو JPEG أو PNG أو GIF أو WebP — ١٠ ميغابايت للملف، ١٠ ملفات كحد أقصى.",
      preview: "معاينة",
      previewTitle: "عنوان الإعلان",
      previewText: "سيظهر نص إعلانك هنا.",
      btnAddAnnonce: "نشر الإعلان",
      annoncesList: "الإعلانات المنشورة",
      annoncesCount: "{n} إعلان",
      noneAnnonce: "لا توجد إعلانات منشورة حاليًا.",
      del: "حذف",
      files: "{n} مرفق",
      confirmDelete: "حذف هذا الإعلان نهائيًا؟",
      loading: "جاري التحميل…",
      publishing: "جاري النشر…",
      published: "تم نشر الإعلان.",
      deleted: "تم حذف الإعلان.",
      errGeneric: "حدث خطأ.",
      errNetwork: "خطأ في الشبكة. حاول مرة أخرى.",
    },
  };

  var state = { lang: "fr", annonces: [] };

  var COLORS = ["#f5f0e1", "#c9a84c", "#ffffff", "#e8d5a3", "#93f4ce", "#7eb6ff", "#ff9f9f", "#2d6a4f"];

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
  setInterval(refreshToken, 25 * 60 * 1000);

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

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(state.lang === "ar" ? "ar" : "fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (e) {
      return "";
    }
  }

  /* ---------- Apercu en direct ---------- */

  function updatePreview() {
    var titre = $("titre").value.trim();
    var texte = $("texte").value.trim();
    var police = $("police").value;
    var couleur = $("couleur").value;

    var pt = $("previewTitle");
    var px = $("previewText");
    pt.textContent = titre || t("previewTitle");
    px.textContent = texte || t("previewText");
    // On applique le style via la propriete DOM, jamais par concatenation HTML.
    pt.style.fontFamily = police;
    px.style.fontFamily = police;
    pt.style.color = couleur;
    px.style.color = couleur;
    $("previewDate").textContent = formatDate(new Date().toISOString());
    $("texteCount").textContent = String(texte.length);
  }

  /* ---------- Annonces ---------- */

  async function loadAnnonces() {
    var listEl = $("annoncesList");
    listEl.innerHTML = '<p class="admin-empty">' + escapeHtml(t("loading")) + "</p>";
    try {
      var res = await api("/api/annonces?files=1");
      if (!res.ok) {
        listEl.innerHTML = '<p class="admin-empty is-error">' + escapeHtml(t("errGeneric")) + "</p>";
        return;
      }
      state.annonces = res.data.items || [];
      renderAnnonces();
    } catch (e) {
      if (e.message !== "unauthorized") {
        listEl.innerHTML = '<p class="admin-empty is-error">' + escapeHtml(t("errNetwork")) + "</p>";
      }
    }
  }

  function renderAnnonces() {
    var listEl = $("annoncesList");
    $("annonceCount").textContent = t("annoncesCount", { n: state.annonces.length });

    if (!state.annonces.length) {
      listEl.innerHTML = '<p class="admin-empty">' + escapeHtml(t("noneAnnonce")) + "</p>";
      return;
    }

    listEl.innerHTML = "";
    state.annonces.forEach(function (item) {
      var article = document.createElement("article");
      article.className = "annonce-admin-item";

      var body = document.createElement("div");
      body.className = "annonce-admin-body";
      // Style applique par propriete DOM : aucune valeur ne transite par du HTML.
      body.style.fontFamily = item.police || "Cairo";
      body.style.color = item.couleur || "#f5f0e1";

      var h3 = document.createElement("h3");
      h3.className = "annonce-card-title annonce-admin-title";
      h3.textContent = item.titre;

      var date = document.createElement("p");
      date.className = "annonce-card-date";
      date.textContent = formatDate(item.date);

      var p = document.createElement("p");
      p.className = "annonce-card-text annonce-admin-text";
      p.textContent = item.texte;

      body.appendChild(h3);
      body.appendChild(date);
      body.appendChild(p);

      var files = item.fichiers || [];
      if (files.length) {
        var badge = document.createElement("p");
        badge.className = "annonce-admin-files";
        badge.textContent = t("files", { n: files.length });
        body.appendChild(badge);
      }

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nh-btn nh-btn-danger annonce-delete-btn";
      btn.setAttribute("data-id", item.id);
      btn.textContent = t("del");

      article.appendChild(body);
      article.appendChild(btn);
      listEl.appendChild(article);
    });
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve({
          filename: file.name || "fichier",
          contentType: file.type || "application/octet-stream",
          data: String(reader.result || ""),
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Evenements ---------- */

  var palette = $("colorPalette");
  COLORS.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "admin-color-swatch";
    b.style.background = c;
    b.title = c;
    b.setAttribute("aria-label", "Couleur " + c);
    b.addEventListener("click", function () {
      $("couleur").value = c;
      updatePreview();
    });
    palette.appendChild(b);
  });

  ["titre", "texte", "police", "couleur"].forEach(function (id) {
    $(id).addEventListener("input", updatePreview);
    $(id).addEventListener("change", updatePreview);
  });

  $("annonceForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var status = $("formStatus");
    var submit = $("submitBtn");
    submit.disabled = true;
    setStatus(status, t("publishing"));

    try {
      var fichiers = [];
      var input = $("annonceFiles");
      if (input.files && input.files.length) {
        for (var i = 0; i < input.files.length; i++) {
          fichiers.push(await fileToBase64(input.files[i]));
        }
      }

      var res = await api("/api/annonces", {
        method: "POST",
        jsonBody: {
          titre: $("titre").value.trim(),
          texte: $("texte").value.trim(),
          police: $("police").value,
          couleur: $("couleur").value,
          fichiers: fichiers,
        },
      });

      if (!res.ok) {
        setStatus(status, (res.data && res.data.error) || t("errGeneric"), true);
        return;
      }

      e.target.reset();
      $("couleur").value = "#f5f0e1";
      updatePreview();
      setStatus(status, "");
      toast(t("published"));
      await loadAnnonces();
    } catch (err) {
      if (err.message !== "unauthorized") {
        setStatus(status, t("errNetwork"), true);
        toast(t("errNetwork"), true);
      }
    } finally {
      submit.disabled = false;
    }
  });

  $("annoncesList").addEventListener("click", async function (e) {
    var btn = e.target.closest(".annonce-delete-btn");
    if (!btn) return;
    if (!window.confirm(t("confirmDelete"))) return;
    try {
      var res = await api("/api/annonces?id=" + encodeURIComponent(btn.getAttribute("data-id")), {
        method: "DELETE",
      });
      if (!res.ok) {
        toast((res.data && res.data.error) || t("errGeneric"), true);
        return;
      }
      toast(t("deleted"));
      await loadAnnonces();
    } catch (err) {
      if (err.message !== "unauthorized") toast(t("errNetwork"), true);
    }
  });

  $("adminLangSwitch").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-lang]");
    if (!btn) return;
    state.lang = btn.getAttribute("data-lang") === "ar" ? "ar" : "fr";
    try {
      localStorage.setItem(LANG_KEY, state.lang);
    } catch (err) {}
    applyAdminI18n();
    updatePreview();
    renderAnnonces();
  });

  $("logoutBtn").addEventListener("click", function () {
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
  updatePreview();
  loadAnnonces();
})();
