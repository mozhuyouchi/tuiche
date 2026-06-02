let state = loadState();
let pendingItemCatalog = [];

const els = {
  rosterFile: document.querySelector("#rosterFile"),
  fileName: document.querySelector("#fileName"),
  rosterInput: document.querySelector("#rosterInput"),
  itemRuleList: document.querySelector("#itemRuleList"),
  itemRuleSummary: document.querySelector("#itemRuleSummary"),
  importBtn: document.querySelector("#importBtn"),
  loadDemoBtn: document.querySelector("#loadDemoBtn"),
  memberList: document.querySelector("#memberList"),
  memberCount: document.querySelector("#memberCount"),
  recordList: document.querySelector("#recordList"),
  recordCount: document.querySelector("#recordCount"),
  allocationBody: document.querySelector("#allocationBody"),
  hotCount: document.querySelector("#hotCount"),
  confirmedCount: document.querySelector("#confirmedCount"),
  pendingCount: document.querySelector("#pendingCount"),
  copyBtn: document.querySelector("#copyBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
};

function renderMembers() {
  els.memberCount.textContent = `${state.members.length} 人`;
  if (!state.members.length) {
    els.memberList.innerHTML = `<div class="empty">还没有导入成员</div>`;
    return;
  }

  const itemColumns = rosterItemColumns();
  const rows = state.members
    .map((member) => {
      const itemMap = itemQuantityMap(member.item);
      const bundle = memberBundle(state, member);
      const bindItems = memberBindItems(member);
      const bindReason = bindItems.length ? bindItems.join("、") : "-";
      const baseBundle = bindBundleValue(member.type);
      const bundleText = baseBundle > 0 ? `<span class="${bundle === 0 ? "bundle-zero" : bundle === 2 ? "bundle-two" : ""}">${bundle === 0 ? "不捆" : `捆 ${bundle}`}</span>` : "-";
      const pushText = memberPushStatus(member);
      const itemCells = itemColumns
        .map((item) => `<td class="quantity-cell">${escapeHtml(itemMap.get(item) || "")}</td>`)
        .join("");
      return `
        <tr>
          <td class="name-cell">
            <strong>${escapeHtml(member.name)}</strong>
          </td>
          <td class="hot-reason-cell">${escapeHtml(bindReason)}</td>
          <td class="bundle-cell">${bundleText}</td>
          <td class="push-status-cell">${escapeHtml(pushText)}</td>
          ${itemCells}
        </tr>
      `;
    })
    .join("");

  els.memberList.innerHTML = `
    <div class="roster-sheet-wrap">
      <table class="roster-sheet roster-matrix">
        <thead>
          <tr>
            <th>昵称</th>
            <th>被捆款式</th>
            <th>目前要捆数量</th>
            <th>目前推车状态</th>
            ${itemColumns.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function rosterItemColumns() {
  const catalogItems = (state.itemCatalog || [])
    .map((item) => item.name)
    .filter(Boolean);
  if (catalogItems.length) return catalogItems;

  const items = [];
  state.members.forEach((member) => {
    itemQuantityMap(member.item).forEach((_, item) => {
      if (!items.includes(item)) items.push(item);
    });
  });
  return items.length ? items : ["款式"];
}

function memberBindItems(member) {
  const bindNames = new Set(
    (state.itemCatalog || [])
      .filter((item) => bindRank(item.type) > 0 || bindRank(state.itemRules?.[item.name]) > 0)
      .map((item) => item.name),
  );
  return Array.from(itemQuantityMap(member.item).keys()).filter((item) => bindNames.has(item));
}

function memberPushStatus(member) {
  if (bindBundleValue(member.type) === 0) return "-";
  const records = state.records.filter((record) => record.pusherId === member.id);
  if (!records.length) return "躺吃";
  if (records.some((record) => record.status === "待确认")) return "待确认";
  if (records.some((record) => record.status === "已确认")) return "已交推车";
  return "未通过";
}

function itemQuantityMap(itemText) {
  const map = new Map();
  String(itemText || "")
    .split(/[;；]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const match = part.match(/^(.*)x([0-9.]+)$/i);
      if (match) {
        map.set(match[1], trimNumber(Number(match[2])));
      } else {
        map.set(part, "1");
      }
    });
  return map;
}

function recordCard(record) {
  const pusher = memberById(state, record.pusherId);
  const target = memberById(state, record.targetId);
  const title = record.claimType === "无效推车" ? `${escapeHtml(pusher?.name || "未知")} 申报无效推车` : `${escapeHtml(pusher?.name || "未知")} 推 ${escapeHtml(target?.name || "未知")}`;
  const targetText = record.claimType === "无效推车" ? "无对应被推人" : `被推款：${escapeHtml(target?.item || "未填")}`;
  const creditText = recordCreditText(record);
  return `
    <article class="record-card record-row-card">
      <div>
        <div class="record-top">
          <strong>${title}</strong>
          <span class="status ${statusClass(record.status)}">${statusText(record.status)}</span>
        </div>
        <div class="record-meta record-meta-inline">
          <span>${record.claimType}</span>
          <span>${creditText}</span>
          <span>${targetText}</span>
        </div>
        <p>${escapeHtml(record.proof || "没有填写凭证")}</p>
        ${proofImageMarkup(record)}
      </div>
      <div class="record-actions">
        <button class="mini-button confirm" data-action="confirm" data-id="${record.id}" type="button">通过</button>
        <button class="mini-button" data-action="invalid" data-id="${record.id}" type="button">未通过</button>
      </div>
    </article>
  `;
}

function recordCreditText(record) {
  if (record.claimType === "小推车多") return "计 2 个有效推车";
  if (record.claimType === "有效推车") return "计 1 个有效推车";
  return "计 0 个有效推车";
}

function renderRecords() {
  els.recordCount.textContent = `${state.records.length} 条`;
  els.recordList.innerHTML = state.records.length ? state.records.map(recordCard).join("") : `<div class="empty">还没有推车记录</div>`;
}

function renderAllocation() {
  els.allocationBody.innerHTML = state.members
    .map((member) => {
      const reduction = memberReduction(state, member.id);
      const bundle = memberBundle(state, member);
      const bundleClass = bundle === 0 ? "bundle-zero" : bundle === 2 ? "bundle-two" : "";
      return `
        <tr>
          <td>${escapeHtml(member.name)}</td>
          <td>${escapeHtml(member.item)}</td>
          <td><span class="tag ${tagClass(member.type)}">${member.type}</span></td>
          <td>${bindBundleValue(member.type) > 0 ? `-${reduction}` : "-"}</td>
          <td class="${bundleClass}">${bundle === 0 ? "不捆" : `捆 ${bundle}`}</td>
          <td>${memberStateLabel(state, member)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderSummary() {
  const bundledMembers = state.members.filter((member) => bindBundleValue(member.type) > 0);
  const submittedBundledMembers = bundledMembers.filter((member) => state.records.some((record) => record.pusherId === member.id));
  els.hotCount.textContent = state.members
    .filter((member) => bindBundleValue(member.type) > 0)
    .reduce((total, member) => total + memberBundle(state, member), 0);
  els.confirmedCount.textContent = submittedBundledMembers.length;
  els.pendingCount.textContent = bundledMembers.length - submittedBundledMembers.length;
}

function rosterTextFromMembers() {
  return ["昵称,款式,类型,总金额", ...state.members.map((member) => `${member.name},${member.item},${member.type},${member.amount || ""}`)].join("\n");
}

function currentItemRules() {
  return Object.fromEntries(
    Array.from(document.querySelectorAll("[data-item-rule]")).map((select) => [select.dataset.itemRule, select.value]),
  );
}

function render() {
  if (document.activeElement !== els.rosterInput) {
    els.rosterInput.value = rosterTextFromMembers();
  }
  if (!pendingItemCatalog.length) renderItemRules(state.itemCatalog || []);
  renderMembers();
  renderRecords();
  renderAllocation();
  renderSummary();
}

function renderItemRules(items) {
  const catalog = (items || []).filter((item) => item.name);
  els.itemRuleSummary.textContent = catalog.length ? `已识别 ${catalog.length} 款` : "上传表格后自动识别";
  els.itemRuleList.innerHTML = catalog.length
    ? catalog
        .map((item) => {
          const savedType = normalizeBindType(item.type || state.itemRules?.[item.name] || "不捆");
          return `
            <label class="item-rule-row">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${escapeHtml(item.category || "未分类")}｜${formatPrice(item.price)}</span>
              </div>
              <select data-item-rule="${escapeHtml(item.name)}">
                <option value="捆2" ${savedType === "捆2" ? "selected" : ""}>捆2</option>
                <option value="捆1" ${savedType === "捆1" ? "selected" : ""}>捆1</option>
                <option value="备捆" ${savedType === "备捆" ? "selected" : ""}>备捆</option>
                <option value="不捆" ${savedType === "不捆" ? "selected" : ""}>不捆</option>
              </select>
            </label>
          `;
        })
        .join("")
    : `<div class="empty">上传表格后，这里会显示识别到的款式和单价。</div>`;
}

function formatPrice(value) {
  const price = Number(value || 0);
  return price ? `单价 ${trimNumber(price)}` : "无单价";
}

function allocationRows() {
  return [
    ["成员", "吃款", "捆序", "有效减免", "最终捆物", "状态", "总金额"],
    ...state.members.map((member) => {
      const reduction = memberReduction(state, member.id);
      const bundle = memberBundle(state, member);
      return [
        member.name,
        member.item,
        member.type,
        bindBundleValue(member.type) > 0 ? `-${reduction}` : "-",
        bundle === 0 ? "不捆" : `捆 ${bundle}`,
        memberStateLabel(state, member),
        member.amount || "",
      ];
    }),
  ];
}

function copyResults() {
  navigator.clipboard
    .writeText(allocationRows().map((row) => row.join("\t")).join("\n"))
    .then(() => showToast("结果已复制"))
    .catch(() => showToast("复制失败，可以用下载 CSV"));
}

function downloadCsv() {
  const csv = allocationRows()
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "推车捆物结果.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("CSV 已下载");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-page").forEach((page) => page.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.tab}Page`).classList.add("active");
  });
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const statusMap = {
    confirm: "已确认",
    invalid: "无效",
  };
  state = updateRecord(button.dataset.id, { status: statusMap[button.dataset.action] });
  render();
  showToast(`已标记为${statusText(statusMap[button.dataset.action])}`);
});

els.importBtn.addEventListener("click", () => {
  const itemRules = currentItemRules();
  const parsed = parseRoster(els.rosterInput.value, { itemRules });
  if (!parsed.length) {
    showToast("请先上传并识别排表");
    return;
  }
  const itemCatalog = (pendingItemCatalog.length ? pendingItemCatalog : state.itemCatalog || []).map((item) => ({
    ...item,
    type: itemRules[item.name] || item.type || "不捆",
  }));
  state = replaceMembersFromRoster(els.rosterInput.value, { itemRules }, itemCatalog);
  pendingItemCatalog = [];
  render();
  showToast(`已导入 ${state.members.length} 位成员`);
});

els.loadDemoBtn.addEventListener("click", () => {
  state = resetDemo();
  pendingItemCatalog = [];
  els.rosterInput.value = demoRosterText;
  renderItemRules(state.itemCatalog || []);
  render();
  showToast("已恢复示例数据");
});

els.rosterFile.addEventListener("change", () => {
  const file = els.rosterFile.files?.[0];
  if (!file) return;
  readRosterFile(file)
    .then((result) => {
      els.rosterInput.value = result.text;
      pendingItemCatalog = result.items || [];
      renderItemRules(pendingItemCatalog);
      els.fileName.textContent = `已读取：${file.name}`;
      showToast("排表已解析，请确认捆序后导入");
    })
    .catch((error) => {
      console.error(error);
      showToast("文件读取失败，请改用 CSV 或复制粘贴");
    });
});

els.copyBtn.addEventListener("click", copyResults);
els.downloadBtn.addEventListener("click", downloadCsv);

window.addEventListener("storage", () => {
  state = loadState();
  render();
});

render();

async function readRosterFile(file) {
  if (/\.xlsx$/i.test(file.name)) {
    const rows = await readXlsxRows(file);
    return spreadsheetRowsToRosterData(rows);
  }
  const text = await readTextFile(file);
  return {
    text,
    items: itemCatalogFromRosterText(text),
  };
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", reject);
    reader.readAsText(file, "utf-8");
  });
}

async function readXlsxRows(file) {
  const entries = await readZipEntries(await file.arrayBuffer());
  const sharedStrings = readSharedStrings(entries["xl/sharedStrings.xml"]);
  const sheetName = Object.keys(entries).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
  if (!sheetName) throw new Error("没有找到工作表");
  return readWorksheetRows(entries[sheetName], sharedStrings);
}

async function readZipEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 66000); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("不是有效的 XLSX 文件");

  const entryCount = view.getUint16(endOffset + 10, true);
  let directoryOffset = view.getUint32(endOffset + 16, true);
  const entries = {};

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(directoryOffset, true) !== 0x02014b50) break;
    const method = view.getUint16(directoryOffset + 10, true);
    const compressedSize = view.getUint32(directoryOffset + 20, true);
    const nameLength = view.getUint16(directoryOffset + 28, true);
    const extraLength = view.getUint16(directoryOffset + 30, true);
    const commentLength = view.getUint16(directoryOffset + 32, true);
    const localOffset = view.getUint32(directoryOffset + 42, true);
    const nameBytes = bytes.slice(directoryOffset + 46, directoryOffset + 46 + nameLength);
    const name = new TextDecoder("utf-8").decode(nameBytes);

    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    entries[name] = await inflateZipEntry(compressed, method);
    directoryOffset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateZipEntry(bytes, method) {
  if (method === 0) return new TextDecoder("utf-8").decode(bytes);
  if (method !== 8 || !("DecompressionStream" in window)) {
    throw new Error("当前浏览器无法解压这个 XLSX");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const inflated = await new Response(stream).arrayBuffer();
  return new TextDecoder("utf-8").decode(inflated);
}

function readSharedStrings(xmlText) {
  if (!xmlText) return [];
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  return Array.from(xml.querySelectorAll("si")).map((item) => {
    return Array.from(item.querySelectorAll("t"))
      .map((node) => node.textContent || "")
      .join("");
  });
}

function readWorksheetRows(xmlText, sharedStrings) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  const rows = [];
  xml.querySelectorAll("sheetData row").forEach((rowNode) => {
    const row = [];
    rowNode.querySelectorAll("c").forEach((cell) => {
      const ref = cell.getAttribute("r") || "";
      const column = columnIndex(ref.replace(/\d/g, ""));
      row[column] = readCellValue(cell, sharedStrings);
    });
    rows.push(row);
  });
  return rows;
}

function columnIndex(letters) {
  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function readCellValue(cell, sharedStrings) {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    return Array.from(cell.querySelectorAll("is t"))
      .map((node) => node.textContent || "")
      .join("");
  }
  const raw = cell.querySelector("v")?.textContent || "";
  if (type === "s") return sharedStrings[Number(raw)] || "";
  return raw;
}

function spreadsheetRowsToRosterData(rows) {
  const nameHeaderRowIndex = rows.findIndex((row) => row.some((cell) => String(cell || "").includes("昵称")));
  if (nameHeaderRowIndex >= 0) {
    return summarySheetToRosterData(rows, nameHeaderRowIndex);
  }
  const assignmentData = assignmentSheetToRosterData(rows);
  if (assignmentData) return assignmentData;
  const text = flatRowsToRosterText(rows);
  return {
    text,
    items: itemCatalogFromRosterText(text),
  };
}

function assignmentSheetToRosterData(rows) {
  const itemRef = findRowLabel(rows, ["谷子", "种类", "款式"]);
  if (!itemRef) return null;

  const { rowIndex: itemRowIndex, column: labelColumn } = itemRef;
  const itemRow = rows[itemRowIndex];
  const priceRow = findPriceRowForItemRow(rows, itemRowIndex, labelColumn);
  const categoryRow = fillMergedLikeRow(findLabelRowNear(rows, labelColumn, "分类", itemRowIndex));
  if (!priceRow) return null;

  const itemCatalog = itemRow
    .map((cell, column) => ({
      name: cleanCell(cell),
      category: cleanCell(categoryRow?.[column]),
      price: Number(priceRow?.[column] || 0),
      column,
      type: "不捆",
    }))
    .filter((item) => item.column > labelColumn && item.name)
    .sort((a, b) => b.price - a.price);

  const members = new Map();
  rows.slice(itemRowIndex + 2).forEach((row) => {
    itemCatalog.forEach((item) => {
      const name = cleanCell(row[item.column]);
      if (!name) return;
      if (!members.has(name)) {
        members.set(name, {
          name,
          amount: 0,
          items: new Map(),
        });
      }
      const member = members.get(name);
      member.items.set(item.name, (member.items.get(item.name) || 0) + 1);
      member.amount += item.price || 0;
    });
  });

  const lines = ["昵称,款式,类型,总金额"];
  Array.from(members.values()).forEach((member) => {
    const itemText = itemCatalog
      .map((item) => {
        const quantity = member.items.get(item.name);
        return quantity ? `${item.name}x${trimNumber(quantity)}` : "";
      })
      .filter(Boolean)
      .join(";");
    if (!itemText) return;
    lines.push(`${member.name},${itemText},不捆,${trimNumber(member.amount)}`);
  });

  return {
    text: lines.join("\n"),
    items: itemCatalog.map(({ column, ...item }) => item),
  };
}

function summarySheetToRosterData(rows, nameHeaderRowIndex) {
  const headerRow = rows[nameHeaderRowIndex];
  const nameColumn = headerRow.findIndex((cell) => String(cell || "").includes("昵称"));
  const itemRow = findItemRow(rows, nameHeaderRowIndex, nameColumn);
  const priceRow = findLabelRow(rows, nameHeaderRowIndex, nameColumn, "单价");
  const categoryRow = fillMergedLikeRow(findLabelRow(rows, nameHeaderRowIndex, nameColumn, "分类"));
  const itemCatalog = itemRow
    .map((cell, column) => ({
      name: cleanCell(cell),
      category: cleanCell(categoryRow?.[column]),
      price: Number(priceRow?.[column] || 0),
      column,
      type: "不捆",
    }))
    .filter((item) => item.column > nameColumn && item.name)
    .sort((a, b) => b.price - a.price);
  const lines = ["昵称,款式,类型,总金额"];

  rows.slice(nameHeaderRowIndex + 1).forEach((row) => {
    const name = cleanCell(row[nameColumn]);
    if (!name) return;
    const items = [];
    for (const item of itemCatalog) {
      const quantity = Number(row[item.column] || 0);
      if (!quantity) continue;
      items.push(`${item.name}x${trimNumber(quantity)}`);
    }
    if (!items.length) return;
    const itemText = items.join(";");
    const amount = cleanCell(row[0]);
    lines.push(`${name},${itemText},不捆,${amount}`);
  });

  return {
    text: lines.join("\n"),
    items: itemCatalog.map(({ column, ...item }) => item),
  };
}

function findItemRow(rows, nameHeaderRowIndex, nameColumn) {
  for (let rowIndex = nameHeaderRowIndex - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];
    const rowLabel = cleanCell(row[nameColumn]);
    if (rowLabel.includes("种类") || rowLabel.includes("款式")) return row;
  }
  for (let rowIndex = nameHeaderRowIndex - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];
    const hasItems = row.slice(nameColumn + 1).some((cell) => cleanCell(cell));
    if (hasItems) return row;
  }
  return rows[nameHeaderRowIndex];
}

function findLabelRow(rows, nameHeaderRowIndex, nameColumn, label) {
  for (let rowIndex = nameHeaderRowIndex - 1; rowIndex >= 0; rowIndex -= 1) {
    const row = rows[rowIndex];
    if (cleanCell(row[nameColumn]).includes(label)) return row;
  }
  return [];
}

function findRowLabel(rows, labels) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (let column = 0; column < row.length; column += 1) {
      const value = cleanCell(row[column]);
      if (labels.some((label) => value === label || value.includes(label))) {
        return { rowIndex, column };
      }
    }
  }
  return null;
}

function findLabelRowNear(rows, labelColumn, label, beforeRowIndex) {
  const limit = Math.min(rows.length, beforeRowIndex + 4);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const row = rows[rowIndex];
    if (cleanCell(row[labelColumn]).includes(label)) return row;
  }
  return [];
}

function findPriceRowForItemRow(rows, itemRowIndex, labelColumn) {
  const nextRow = rows[itemRowIndex + 1] || [];
  if (cleanCell(nextRow[labelColumn]).includes("单价")) return nextRow;
  const nextRowHasPrices = nextRow
    .slice(labelColumn + 1)
    .some((cell) => Number(cell || 0) > 0);
  if (nextRowHasPrices) return nextRow;
  return findLabelRowNear(rows, labelColumn, "单价", itemRowIndex + 4);
}

function fillMergedLikeRow(row) {
  let current = "";
  return (row || []).map((cell) => {
    const value = cleanCell(cell);
    if (value) current = value;
    return current;
  });
}

function flatRowsToRosterText(rows) {
  const lines = ["昵称,款式,类型"];
  rows.forEach((row) => {
    const cells = row.map(cleanCell).filter(Boolean);
    if (cells.length >= 2 && !cells[0].includes("昵称")) {
      lines.push(`${cells[0]},${cells[1]},${cells[2] || "不捆"}`);
    }
  });
  return lines.join("\n");
}

function itemCatalogFromRosterText(text) {
  const items = [];
  parseRoster(text, { itemRules: {} }).forEach((member) => {
    itemQuantityMap(member.item).forEach((_, item) => {
      if (!items.some((entry) => entry.name === item)) {
        items.push({ name: item, category: "", price: 0, type: "不捆" });
      }
    });
  });
  return items;
}

function cleanCell(value) {
  return String(value ?? "").trim();
}

function trimNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, "").replace(/\.$/, "");
}
