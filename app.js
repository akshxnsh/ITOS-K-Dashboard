(function startDashboard() {
  "use strict";

  var state = {
    summary: null,
    worker: null,
    fallbackIndex: null,
    usingWorker: false,
    searchRequestId: 0
  };

  var COLUMN_LABELS = {
    cr9a7_assetcode: "Asset Code",
    cr9a7_categoryname: "Category Name",
    cr9a7_assetstore: "Asset Store",
    cr9a7_assetusage: "Asset Usage"
  };

  var els = {
    fileInput: document.getElementById("fileInput"),
    importStatus: document.getElementById("importStatus"),
    alertHost: document.getElementById("alertHost"),
    totalAssets: document.getElementById("totalAssets"),
    categoryTotal: document.getElementById("categoryTotal"),
    fileMeta: document.getElementById("fileMeta"),
    worksheetMeta: document.getElementById("worksheetMeta"),
    categoryGrid: document.getElementById("categoryGrid"),
    vendorSection: document.getElementById("vendorSection"),
    vendorGrid: document.getElementById("vendorGrid"),
    dashboardView: document.getElementById("dashboardView"),
    categoryFullscreenButton: document.getElementById("categoryFullscreenButton"),
    imacButton: document.getElementById("imacButton"),
    imacView: document.getElementById("imacView"),
    imacCategoryGrid: document.getElementById("imacCategoryGrid"),
    assetView: document.getElementById("assetView"),
    backFromAsset: document.getElementById("backFromAsset"),
    backToDashboardFromImac: document.getElementById("backToDashboardFromImac"),
    searchForm: document.getElementById("searchForm"),
    assetCodeInput: document.getElementById("assetCodeInput"),
    searchButton: document.getElementById("searchButton"),
    searchMessage: document.getElementById("searchMessage"),
    assetTitle: document.getElementById("assetTitle"),
    assetDetails: document.getElementById("assetDetails")
  };

  function formatNumber(value) {
    return new Intl.NumberFormat("en-IN").format(value || 0);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function displayColumnName(columnName) {
    return COLUMN_LABELS[columnName] || columnName;
  }

  function setAlert(message, type) {
    if (!message) {
      els.alertHost.innerHTML = "";
      return;
    }

    els.alertHost.innerHTML = '<div class="alert ' + (type ? "is-" + type : "") + '">' + escapeHtml(message) + "</div>";
  }

  function setImportStatus(title, detail, progress) {
    var detailHtml = detail ? "<span>" + escapeHtml(detail) + "</span>" : "";
    var progressHtml = "";
    if (typeof progress === "number") {
      progressHtml = '<div class="progress-track" aria-hidden="true"><div class="progress-bar" style="width: ' + Math.round(progress * 100) + '%"></div></div>';
    }

    els.importStatus.innerHTML = "<strong>" + escapeHtml(title) + "</strong>" + detailHtml + progressHtml;
  }

  function setSearchEnabled(enabled) {
    els.assetCodeInput.disabled = !enabled;
    els.searchButton.disabled = !enabled;
  }

  function showView(viewName) {
    els.dashboardView.classList.toggle("is-active", viewName === "dashboard");
    els.imacView.classList.toggle("is-active", viewName === "imac");
    els.assetView.classList.toggle("is-active", viewName === "asset");
  }

  function isCategoryFullscreen() {
    return document.fullscreenElement === els.dashboardView;
  }

  function updateFullscreenButton() {
    var isFullscreen = isCategoryFullscreen();
    var isSupported = Boolean(document.fullscreenEnabled && els.dashboardView.requestFullscreen);
    els.categoryFullscreenButton.classList.toggle("is-fullscreen", isFullscreen);
    els.categoryFullscreenButton.disabled = !isSupported;
    els.categoryFullscreenButton.setAttribute("aria-label", isFullscreen ? "Exit category fullscreen" : "Expand category section");
    els.categoryFullscreenButton.setAttribute("title", isFullscreen ? "Exit category fullscreen" : "Expand category section");
  }

  function toggleCategoryFullscreen() {
    if (!document.fullscreenEnabled || !els.dashboardView.requestFullscreen) {
      return;
    }

    if (isCategoryFullscreen()) {
      document.exitFullscreen().catch(function ignoreFullscreenExitError() {});
      return;
    }

    els.dashboardView.requestFullscreen().catch(function ignoreFullscreenRequestError() {});
  }

  function resetDashboard() {
    state.summary = null;
    state.fallbackIndex = null;
    els.totalAssets.textContent = "0";
    els.categoryTotal.textContent = "0";
    els.fileMeta.textContent = "Filtered inventory";
    els.worksheetMeta.textContent = "Unique categories";
    els.categoryGrid.innerHTML = '<div class="empty-state"><strong>Ready for import</strong><span>Kharkhoda category cards will appear here.</span></div>';
    els.vendorGrid.innerHTML = '<div class="empty-state"><strong>No vendor data yet</strong><span>Vendor cards appear here in fullscreen.</span></div>';
    els.imacCategoryGrid.innerHTML = '<div class="empty-state"><strong>Ready for import</strong><span>IMAC category cards will appear here.</span></div>';
    els.assetDetails.innerHTML = "";
    els.imacButton.disabled = true;
    els.searchMessage.textContent = "";
    document.body.classList.remove("has-data");
    setSearchEnabled(false);
    showView("dashboard");
  }

  function renderSummary(summary) {
    state.summary = summary;
    els.totalAssets.textContent = formatNumber(summary.kharkhodaCount);
    els.categoryTotal.textContent = formatNumber(summary.categoryCount);
    els.fileMeta.textContent = "Filtered inventory";
    els.worksheetMeta.textContent = "Unique categories";

    if (summary.kharkhodaCount === 0) {
      els.categoryGrid.innerHTML = '<div class="empty-state"><strong>No Kharkhoda records found</strong><span>Check the selected file and try again.</span></div>';
    } else if (summary.categories.length === 0) {
      els.categoryGrid.innerHTML = '<div class="empty-state"><strong>No categories found</strong><span>The loaded Kharkhoda records have no category values.</span></div>';
    } else {
      var imacCategoryMap = {};
      if (summary.imacSummary && summary.imacSummary.categories) {
        summary.imacSummary.categories.forEach(function mapImacCategory(imacCategory) {
          var key = imacCategory.key || imacCategory.name || "";
          if (key) {
            imacCategoryMap[key] = imacCategory;
          }
        });
      }

      els.categoryGrid.innerHTML = summary.categories.map(function renderCard(category) {
        var isOutOfStock = category.inStockCount === 0;
        var cardClass = isOutOfStock ? "category-card is-out-of-stock" : "category-card";
        var imacCategory = imacCategoryMap[category.key] || imacCategoryMap[category.name] || null;
        var completedCount = imacCategory ? imacCategory.completedCount : 0;
        var pendingCount = imacCategory ? imacCategory.pendingCount : 0;

        return [
          '<article class="' + cardClass + '">',
          isOutOfStock ? '<span class="stock-badge">Out of stock</span>' : "",
          '<h3>' + escapeHtml(category.name) + "</h3>",
          '<div class="metric-grid">',
          '<div class="metric-pill is-in-stock">',
          '<strong>' + formatNumber(category.inStockCount) + '</strong>',
          '<span>In Stock</span>',
          '</div>',
          '<div class="metric-pill">',
          '<strong>' + formatNumber(completedCount) + '</strong>',
          '<span>Comp</span>',
          '</div>',
          '<div class="metric-pill">',
          '<strong>' + formatNumber(pendingCount) + '</strong>',
          '<span>Pend</span>',
          '</div>',
          '</div>',
          '</article>'
        ].join("");
      }).join("");
    }

    setSearchEnabled(summary.kharkhodaCount > 0);
    setImportStatus("Data loaded", "");
    setAlert("");
    document.body.classList.add("has-data");
    els.imacButton.disabled = false;
    renderImacSummary(summary);
    renderVendorSummary(summary);
    showView("dashboard");
  }

  function renderVendorSummary(summary) {
    var vendorSummary = summary && summary.vendorSummary ? summary.vendorSummary : null;
    var isFullscreen = document.fullscreenElement === els.dashboardView;

    if (!vendorSummary || !vendorSummary.categories || vendorSummary.categories.length === 0) {
      els.vendorGrid.innerHTML = '<div class="empty-state"><strong>No vendor data yet</strong><span>Vendor cards appear here in fullscreen.</span></div>';
      return;
    }

    els.vendorGrid.innerHTML = vendorSummary.categories.map(function renderVendorCard(vendor) {
      var vendorName = vendor.name || "(Blank Vendor)";
      return [
        '<article class="vendor-card' + (isFullscreen ? ' is-visible' : '') + '">',
        '<h3 title="' + escapeHtml(vendorName) + '">' + escapeHtml(vendorName) + '</h3>',
        '<div class="vendor-metrics">',
        '<div class="vendor-metric">',
        '<strong>' + formatNumber(vendor.assetCount) + '</strong>',
        '<span>Assets</span>',
        '</div>',
        '<div class="vendor-metric">',
        '<strong>' + formatNumber(vendor.pendingCount) + '</strong>',
        '<span>Pend</span>',
        '</div>',
        '</div>',
        '</article>'
      ].join("");
    }).join("");
  }

  function renderImacSummary(summary) {
    var imacSummary = summary && summary.imacSummary ? summary.imacSummary : null;

    if (!imacSummary || imacSummary.kharkhodaCount === 0) {
      els.imacCategoryGrid.innerHTML = '<div class="empty-state"><strong>No IMAC matching rows found</strong><span>Check the selected file and try again.</span></div>';
    } else if (imacSummary.categories.length === 0) {
      els.imacCategoryGrid.innerHTML = '<div class="empty-state"><strong>No categories found</strong><span>The loaded IMAC rows have no category values.</span></div>';
    } else {
      els.imacCategoryGrid.innerHTML = imacSummary.categories.map(function renderImacCard(category) {
        return [
          '<article class="category-card">',
          '<h3>' + escapeHtml(category.name) + '</h3>',
          '<div class="card-metric">',
          '<div><strong>' + formatNumber(category.completedCount) + '</strong></div>',
          '<span>Completed</span>',
          '</div>',
          '<div class="card-metric">',
          '<div><strong>' + formatNumber(category.pendingCount) + '</strong></div>',
          '<span>Pending</span>',
          '</div>',
          '</article>'
        ].join("");
      }).join("");
    }
  }

  function renderAssetDetails(searchResult) {
    var matches = searchResult.matches && searchResult.matches.length ? searchResult.matches : [{ row: searchResult.row || {} }];
    var duplicateNote = matches.length > 1 ? " - " + formatNumber(matches.length) + " matching rows" : "";

    els.assetTitle.textContent = searchResult.code;
    els.searchMessage.textContent = "Match found" + duplicateNote + ".";
    els.assetDetails.innerHTML = matches.map(function renderMatch(match, matchIndex) {
      var row = match.row || {};
      var keys = Object.keys(row);
      var heading = matches.length > 1 ? '<div class="asset-match-heading">Match ' + formatNumber(matchIndex + 1) + " of " + formatNumber(matches.length) + "</div>" : "";

      return [
        '<section class="asset-match">',
        heading,
        '<table class="asset-table">',
        "<tbody>",
        keys.map(function renderRow(key) {
          return "<tr><th>" + escapeHtml(displayColumnName(key)) + "</th><td>" + escapeHtml(row[key]) + "</td></tr>";
        }).join(""),
        "</tbody>",
        "</table>",
        "</section>"
      ].join("");
    }).join("");
    showView("asset");
  }

  function handleProgress(progress) {
    setImportStatus(progress.message || "Processing data file", progress.stage || "Working", progress.ratio);
  }

  function processInMainThread(file) {
    setImportStatus("Processing data file", "Using in-page processor", 0.12);

    return file.arrayBuffer().then(function parseBuffer(buffer) {
      return new Promise(function yieldToPaint(resolve) {
        window.setTimeout(function runParse() {
          var result = window.AssetExcelProcessor.processWorkbook(buffer, file.name, handleProgress);
          state.fallbackIndex = result.index;
          state.usingWorker = false;
          resolve(result.summary);
        }, 30);
      });
    });
  }

  function makeWorker() {
    if (!("Worker" in window)) return null;

    try {
      return new Worker("app.worker.js");
    } catch (error) {
      return null;
    }
  }

  function processWithWorker(file) {
    return new Promise(function workerPromise(resolve, reject) {
      var worker = makeWorker();
      var settled = false;

      if (!worker) {
        reject(new Error("Worker unavailable"));
        return;
      }

      state.worker = worker;
      state.usingWorker = true;

      worker.onmessage = function handleMessage(event) {
        var message = event.data || {};

        if (message.type === "progress") {
          handleProgress(message.progress || {});
        }

        if (message.type === "ready") {
          settled = true;
          resolve(message.summary);
        }

        if (message.type === "error") {
          settled = true;
          reject(new Error(message.message || "Import failed."));
        }

        if (message.type === "searchResult") {
          handleSearchResult(message);
        }

        if (message.type === "searchError") {
          els.searchMessage.textContent = message.message || "Search failed.";
        }
      };

      worker.onerror = function handleWorkerError() {
        if (!settled) reject(new Error("Worker failed"));
      };

      file.arrayBuffer().then(function postBuffer(buffer) {
        worker.postMessage({
          type: "parse",
          fileName: file.name,
          arrayBuffer: buffer
        }, [buffer]);
      }).catch(reject);
    });
  }

  function importFile(file) {
    if (!file) return;

    resetDashboard();
    setAlert("");
    setImportStatus("Importing data file", file.name, 0.02);

    if (state.worker) {
      state.worker.terminate();
      state.worker = null;
    }

    processWithWorker(file)
      .catch(function fallback(error) {
        if (state.worker) {
          state.worker.terminate();
          state.worker = null;
        }
        state.usingWorker = false;
        if (error.message !== "Worker unavailable" && error.message !== "Worker failed") {
          throw error;
        }
        return processInMainThread(file);
      })
      .then(function complete(summary) {
        renderSummary(summary);
      })
      .catch(function fail(error) {
        resetDashboard();
        setImportStatus("Import failed", file.name);
        setAlert(error && error.message ? error.message : "The data file could not be imported.", "error");
      });
  }

  function handleSearchResult(message) {
    if (message.requestId !== state.searchRequestId) return;

    if (!message.result) {
      els.searchMessage.textContent = "No Kharkhoda asset found for that exact Asset Code.";
      showView("dashboard");
      return;
    }

    renderAssetDetails(message.result);
  }

  function searchAsset(assetCode) {
    els.searchMessage.textContent = "Searching...";
    state.searchRequestId += 1;

    if (state.usingWorker && state.worker) {
      state.worker.postMessage({
        type: "search",
        requestId: state.searchRequestId,
        assetCode: assetCode
      });
      return;
    }

    try {
      var result = window.AssetExcelProcessor.searchAsset(state.fallbackIndex, assetCode);
      handleSearchResult({
        requestId: state.searchRequestId,
        result: result
      });
    } catch (error) {
      els.searchMessage.textContent = error && error.message ? error.message : "Search failed.";
    }
  }

  els.fileInput.addEventListener("change", function handleFileChange(event) {
    importFile(event.target.files && event.target.files[0]);
  });

  els.imacButton.addEventListener("click", function handleImacButtonClick() {
    renderImacSummary(state.summary);
    showView("imac");
  });

  els.backFromAsset.addEventListener("click", function goBackFromAsset() {
    showView("dashboard");
  });

  els.backToDashboardFromImac.addEventListener("click", function goBackToDashboard() {
    showView("dashboard");
  });

  els.categoryFullscreenButton.addEventListener("click", function handleFullscreenClick() {
    toggleCategoryFullscreen();
  });

  document.addEventListener("fullscreenchange", updateFullscreenButton);

  els.searchForm.addEventListener("submit", function handleSearch(event) {
    event.preventDefault();
    var assetCode = els.assetCodeInput.value.trim();

    if (!assetCode) {
      els.searchMessage.textContent = "Enter an exact Asset Code.";
      return;
    }

    searchAsset(assetCode);
  });

  resetDashboard();
  updateFullscreenButton();
})();
