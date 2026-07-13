(function attachAssetDataProcessor(global) {
  "use strict";

  var FIELD_DEFINITIONS = [
    {
      key: "categoryName",
      displayName: "Category Name",
      aliases: ["Category Name", "cr9a7_categoryname"]
    },
    {
      key: "assetCode",
      displayName: "Asset Code",
      aliases: ["Asset Code", "cr9a7_assetcode"]
    },
    {
      key: "assetStore",
      displayName: "Asset Store",
      aliases: ["Asset Store", "cr9a7_assetstore"]
    },
    {
      key: "userName",
      displayName: "User Name",
      aliases: ["User Name"],
      optional: true
    },
    {
      key: "assetUsage",
      displayName: "Asset Usage",
      aliases: ["Asset Usage", "cr9a7_assetusage"],
      optional: true
    }
  ];

  var REQUIRED_COLUMNS = FIELD_DEFINITIONS.filter(function isRequired(field) {
    return !field.optional;
  }).map(function mapDisplayName(field) {
    return field.displayName;
  });

  var KHARKHODA_STORES = {
    "Kharkhoda Store": true,
    "Kharkhoda New Asset Store": true
  };

  var IN_STOCK_USER_NAMES = {
    "K/PATHAK MRITYUNJAY KUMAR": true,
    "JET2(ITOS-K)": true
  };
  var HEADER_SCAN_ROWS = 50;
  var SUPPORTED_EXTENSIONS = {
    csv: "CSV",
    xls: "Excel",
    xlsx: "Excel"
  };

  function cellText(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function headerText(value) {
    return cellText(value).trim();
  }

  function displayName(value, fallback) {
    var text = cellText(value);
    return text === "" ? fallback : text;
  }

  function formatAssetCode(value) {
    return cellText(value).trim();
  }

  function normalizeAssetCodeKey(value) {
    return formatAssetCode(value).toUpperCase();
  }

  function getExtension(fileName) {
    var match = cellText(fileName).toLowerCase().match(/\.([^.]+)$/);
    return match ? match[1] : "";
  }

  function getFileType(fileName) {
    var extension = getExtension(fileName);
    if (!SUPPORTED_EXTENSIONS[extension]) {
      throw new Error("Unsupported file type. Import a .xlsx, .xls, or .csv file.");
    }
    return SUPPORTED_EXTENSIONS[extension];
  }

  function makeProgress(onProgress, stage, ratio, message) {
    if (typeof onProgress === "function") {
      onProgress({
        stage: stage,
        ratio: Math.max(0, Math.min(1, ratio || 0)),
        message: message
      });
    }
  }

  function readCell(ws, rowIndex, columnIndex) {
    var address = global.XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
    var cell = ws[address];
    if (!cell) return "";
    if (cell.w !== undefined) return cellText(cell.w);
    return cellText(cell.v);
  }

  function findSourceColumn(columns, aliases) {
    for (var i = 0; i < aliases.length; i += 1) {
      var alias = aliases[i];
      for (var col = 0; col < columns.length; col += 1) {
        if (columns[col] === alias) return col;
      }
    }
    return -1;
  }

  function mapColumns(columns) {
    var fieldMap = {};
    var missing = [];
    var present = 0;

    FIELD_DEFINITIONS.forEach(function mapField(field) {
      var index = findSourceColumn(columns, field.aliases);
      if (index === -1) {
        if (!field.optional) missing.push(field.displayName);
        return;
      }

      present += 1;
      fieldMap[field.key] = {
        sourceColumn: columns[index],
        columnIndex: index
      };
    });

    return {
      fieldMap: fieldMap,
      missing: missing,
      present: present
    };
  }

  function detectHeaderInSheet(ws) {
    if (!ws || !ws["!ref"]) return null;

    var range = global.XLSX.utils.decode_range(ws["!ref"]);
    var rowLimit = Math.min(range.e.r, range.s.r + HEADER_SCAN_ROWS - 1);
    var best = null;

    for (var row = range.s.r; row <= rowLimit; row += 1) {
      var columns = [];

      for (var col = range.s.c; col <= range.e.c; col += 1) {
        columns.push(headerText(readCell(ws, row, col)));
      }

      var mapping = mapColumns(columns);
      var detection = {
        headerRow: row,
        columns: columns,
        fieldMap: mapping.fieldMap,
        missing: mapping.missing,
        present: mapping.present
      };

      if (!best || detection.present > best.present) best = detection;
      if (detection.missing.length === 0) return detection;
    }

    return best;
  }

  function missingColumnError(missing) {
    return new Error(
      "Missing required column" +
      (missing.length > 1 ? "s" : "") +
      ": " +
      missing.join(", ") +
      ". Accepted headers are display names or Dataverse logical names."
    );
  }

  function detectWorksheet(workbook) {
    var best = null;

    workbook.SheetNames.forEach(function scanSheet(name) {
      var detection = detectHeaderInSheet(workbook.Sheets[name]);
      if (!detection) return;
      detection.sheetName = name;

      if (detection.missing.length === 0 && !best) {
        best = detection;
        return;
      }

      if (!best || detection.present > best.present) best = detection;
    });

    if (!best || best.missing.length > 0) {
      throw missingColumnError(best ? best.missing : REQUIRED_COLUMNS.slice());
    }

    return best;
  }

  function parseWorkbook(arrayBuffer, fileName, fileType, onProgress) {
    makeProgress(onProgress, "read", 0.08, fileType === "CSV" ? "Reading CSV" : "Reading workbook");

    if (fileType === "CSV") {
      var csvText = new TextDecoder("utf-8").decode(arrayBuffer);
      return global.XLSX.read(csvText, {
        type: "string",
        raw: false,
        cellDates: false,
        cellNF: false,
        cellText: true
      });
    }

    return global.XLSX.read(arrayBuffer, {
      type: "array",
      cellDates: false,
      cellNF: false,
      cellText: true
    });
  }

  function normalizeRow(row, fieldMap) {
    return {
      categoryName: cellText(row[fieldMap.categoryName.sourceColumn]),
      assetCode: cellText(row[fieldMap.assetCode.sourceColumn]),
      assetStore: cellText(row[fieldMap.assetStore.sourceColumn]),
      userName: fieldMap.userName ? cellText(row[fieldMap.userName.sourceColumn]) : "",
      assetUsage: fieldMap.assetUsage ? cellText(row[fieldMap.assetUsage.sourceColumn]) : ""
    };
  }

  function sortByName(a, b) {
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  }

  function sortUsage(a, b) {
    if (b.count !== a.count) return b.count - a.count;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  }

  function isInStockRow(row) {
    if (KHARKHODA_STORES[row.assetStore] !== true) return false;

    var userName = cellText(row.userName).trim().toUpperCase();
    return IN_STOCK_USER_NAMES[userName] === true;
  }

  function buildIndexes(rows, fieldMap, onProgress) {
    var categoryMap = new Map();
    var assetByCode = new Map();
    var kharkhodaCount = 0;
    var lastProgress = 0;

    makeProgress(onProgress, "index", 0.45, "Building indexes");

    for (var index = 0; index < rows.length; index += 1) {
      var sourceRow = rows[index];
      var row = normalizeRow(sourceRow, fieldMap);

      if (KHARKHODA_STORES[row.assetStore] === true) {
        kharkhodaCount += 1;

        var categoryName = row.categoryName;
        var categoryEntry = categoryMap.get(categoryName);

        if (!categoryEntry) {
          categoryEntry = {
            key: categoryName,
            name: displayName(categoryName, "(Blank Category)"),
            totalCount: 0,
            inStockCount: 0
          };
          categoryMap.set(categoryName, categoryEntry);
        }

        categoryEntry.totalCount += 1;
        if (isInStockRow(row)) categoryEntry.inStockCount += 1;

        var assetCodeKey = normalizeAssetCodeKey(row.assetCode);
        if (assetCodeKey !== "") {
          var existing = assetByCode.get(assetCodeKey);
          if (existing) {
            existing.matches.push(sourceRow);
          } else {
            assetByCode.set(assetCodeKey, {
              matches: [sourceRow]
            });
          }
        }
      }

      if (rows.length > 0 && index - lastProgress >= 1000) {
        lastProgress = index;
        makeProgress(
          onProgress,
          "index",
          0.45 + (index / rows.length) * 0.45,
          "Building indexes"
        );
      }
    }

    var categories = Array.from(categoryMap.values()).map(function mapCategory(entry) {
      return {
        key: entry.key,
        name: entry.name,
        totalCount: entry.totalCount,
        inStockCount: entry.inStockCount,
        usageCounts: []
      };
    }).sort(sortByName);

    return {
      categories: categories,
      kharkhodaCount: kharkhodaCount,
      assetByCode: assetByCode
    };
  }

  function processWorkbook(arrayBuffer, fileName, onProgress) {
    if (!global.XLSX) {
      throw new Error("The local SheetJS parser could not be loaded.");
    }

    var fileType = getFileType(fileName);
    var workbook = parseWorkbook(arrayBuffer, fileName, fileType, onProgress);

    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error("This file does not contain any worksheets or CSV data.");
    }

    makeProgress(onProgress, "detect", 0.2, "Detecting asset data");
    var detected = detectWorksheet(workbook);
    var worksheet = workbook.Sheets[detected.sheetName];

    makeProgress(onProgress, "parse", 0.35, "Parsing asset rows");
    var rows = global.XLSX.utils.sheet_to_json(worksheet, {
      range: detected.headerRow,
      defval: "",
      raw: false,
      blankrows: false
    });

    var indexes = buildIndexes(rows, detected.fieldMap, onProgress);

    makeProgress(onProgress, "complete", 1, "Import complete");

    return {
      summary: {
        fileName: fileName,
        fileType: fileType,
        sheetName: detected.sheetName,
        headerRow: detected.headerRow + 1,
        sourceRowCount: rows.length,
        kharkhodaCount: indexes.kharkhodaCount,
        categoryCount: indexes.categories.length,
        categories: indexes.categories
      },
      index: {
        assetByCode: indexes.assetByCode
      }
    };
  }

  function searchAsset(index, assetCode) {
    if (!index || !index.assetByCode) {
      throw new Error("No data file has been loaded.");
    }

    var code = formatAssetCode(assetCode);
    var key = normalizeAssetCodeKey(assetCode);
    if (key === "") return null;

    var result = index.assetByCode.get(key);
    if (!result) return null;

    return {
      code: code,
      duplicateCount: result.matches.length,
      row: result.matches[0],
      matches: result.matches.map(function mapMatch(row) {
        return {
          row: row
        };
      })
    };
  }

  global.AssetExcelProcessor = {
    processWorkbook: processWorkbook,
    searchAsset: searchAsset
  };
})(typeof self !== "undefined" ? self : window);
