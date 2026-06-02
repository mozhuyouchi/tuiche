const CAR_DB_KEY = "car-push-tool-v2";

const demoRosterText = `昵称,款式,类型
阿乖,胀相,不捆
龙虾,五条,不捆
凸凸,乙骨,不捆
星星,真依,不捆
阿娇,五条,不捆`;

const defaultKeywordRules = {
  hot: "五条",
  cold: "",
};

const legacyRemovedStatus = "\u4e89\u8bae";

function makeId(prefix) {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeBindType(type = "") {
  if (type === "捆2" || type.includes("热")) return "捆2";
  if (type === "捆1") return "捆1";
  if (type === "备捆") return "备捆";
  if (type === "捆物") return "捆物";
  return "不捆";
}

function parseKeywordInput(value = "") {
  return value
    .split(/[,，、\s\n\r]+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function inferType(parts, keywordRules = defaultKeywordRules) {
  const rowText = parts.join(" ");
  const itemRules = keywordRules.itemRules || {};
  const entries = Object.entries(itemRules).filter(([item]) => item && rowText.includes(item));
  if (entries.length) {
    return entries
      .map(([, type]) => type)
      .map(normalizeBindType)
      .sort((a, b) => bindRank(b) - bindRank(a))[0];
  }
  const hotKeywords = parseKeywordInput(keywordRules.hot);
  const coldKeywords = parseKeywordInput(keywordRules.cold);
  if (hotKeywords.some((keyword) => rowText.includes(keyword))) return "捆2";
  if (coldKeywords.some((keyword) => rowText.includes(keyword))) return "不捆";
  return normalizeBindType(parts[2] || "不捆");
}

function parseRoster(text, keywordRules = defaultKeywordRules) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^昵称[,，\s\t]*款式/.test(line))
    .map((line, index) => {
      const parts = line.split(/[,，\t ]+/).filter(Boolean);
      const name = parts[0] || `成员${index + 1}`;
      return {
        id: `member-${index}-${name}`,
        name,
        item: parts[1] || "未填",
        type: inferType(parts, keywordRules),
        amount: parts[3] || "",
      };
    });
}

function defaultState() {
  const members = parseRoster(demoRosterText, defaultKeywordRules);
  const byName = Object.fromEntries(members.map((member) => [member.name, member]));
  return {
    members,
    keywordRules: { ...defaultKeywordRules },
    itemRules: { 五条: "捆2", 真依: "不捆" },
    itemCatalog: [
      { name: "五条", category: "", price: 73.5, type: "捆2" },
      { name: "真依", category: "", price: 4.5, type: "不捆" },
      { name: "胀相", category: "", price: 0, type: "不捆" },
      { name: "乙骨", category: "", price: 0, type: "不捆" },
    ],
    records: [
      byName["阿乖"] && byName["凸凸"]
        ? {
            id: makeId("record"),
            pusherId: byName["阿乖"].id,
            targetId: byName["凸凸"].id,
            claimType: "有效推车",
            proof: "示例：凸凸确认是阿乖推来的",
            status: "已确认",
            targetConfirmed: true,
            createdAt: Date.now() - 2000,
          }
        : null,
    ].filter(Boolean),
  };
}

function loadState() {
  const saved = localStorage.getItem(CAR_DB_KEY);
  if (!saved) {
    const state = defaultState();
    saveState(state);
    return state;
  }
  try {
    const state = JSON.parse(saved);
    const records = Array.isArray(state.records)
      ? state.records.map((record) => (record.status === legacyRemovedStatus ? { ...record, status: "未通过" } : record))
      : [];
    return {
      members: Array.isArray(state.members)
        ? state.members.map((member) => ({ ...member, type: normalizeBindType(member.type) }))
        : [],
      records,
      keywordRules: state.keywordRules || { ...defaultKeywordRules },
      itemRules: Object.fromEntries(Object.entries(state.itemRules || {}).map(([item, type]) => [item, normalizeBindType(type)])),
      itemCatalog: Array.isArray(state.itemCatalog)
        ? state.itemCatalog.map((item) => ({ ...item, type: normalizeBindType(item.type) }))
        : [],
    };
  } catch {
    const state = defaultState();
    saveState(state);
    return state;
  }
}

function saveState(state) {
  localStorage.setItem(CAR_DB_KEY, JSON.stringify(state));
}

function replaceMembersFromRoster(text, keywordRules = defaultKeywordRules, itemCatalog = []) {
  const state = loadState();
  state.keywordRules = { ...defaultKeywordRules, ...keywordRules };
  state.itemRules = Object.fromEntries(Object.entries(keywordRules.itemRules || {}).map(([item, type]) => [item, normalizeBindType(type)]));
  state.itemCatalog = itemCatalog.map((item) => ({ ...item, type: normalizeBindType(item.type) }));
  state.members = parseRoster(text, state.keywordRules);
  state.records = state.records.filter((record) => {
    const hasPusher = state.members.some((member) => member.id === record.pusherId);
    const hasTarget = !record.targetId || state.members.some((member) => member.id === record.targetId);
    return hasPusher && hasTarget;
  });
  saveState(state);
  return state;
}

function updateKeywordRules(keywordRules) {
  const state = loadState();
  state.keywordRules = { ...defaultKeywordRules, ...keywordRules };
  saveState(state);
  return state;
}

function addRecord(record) {
  const state = loadState();
  state.records.unshift({
    id: makeId("record"),
    status: "待确认",
    targetConfirmed: false,
    createdAt: Date.now(),
    ...record,
  });
  saveState(state);
  return state;
}

function updateRecord(id, patch) {
  const state = loadState();
  state.records = state.records.map((record) => (record.id === id ? { ...record, ...patch } : record));
  saveState(state);
  return state;
}

function resetDemo() {
  const state = defaultState();
  saveState(state);
  return state;
}

function memberById(state, id) {
  return state.members.find((member) => member.id === id);
}

function recordValue(record) {
  if (record.status === "未通过") return 0;
  if (record.claimType === "无效推车") return 0.5;
  if (record.status !== "已确认") return 0;
  if (record.claimType === "有效推车") return 1;
  if (record.claimType === "小推车多") return 2;
  return 0;
}

function memberReduction(state, memberId) {
  return state.records
    .filter((record) => record.pusherId === memberId)
    .reduce((total, record) => total + recordValue(record), 0);
}

function memberBundle(state, member) {
  if (!member) return 0;
  return Math.max(0, memberBaseBundle(state, member) - memberReduction(state, member.id));
}

function memberStateLabel(state, member) {
  const bundle = memberBundle(state, member);
  const records = state.records.filter((record) => record.pusherId === member.id && record.status !== "未通过");
  if (records.some((record) => record.claimType !== "无效推车" && record.status === "已确认")) return "有效";
  if (records.some((record) => record.claimType === "无效推车")) return "无效";
  if (bundle > 0) return `${trimNumber(memberBindUnitCount(state, member))}+躺吃`;
  return "-";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[char];
  });
}

function tagClass(type) {
  if (type === "热门" || type === "捆2") return "hot";
  if (type === "捆1") return "bind-one";
  if (type === "备捆") return "backup";
  if (type === "冷门" || type === "捆物" || type === "不捆") return "cold";
  return "normal";
}

function bindRank(type) {
  if (type === "捆2" || type === "热门") return 3;
  if (type === "捆1") return 2;
  if (type === "备捆") return 1;
  return 0;
}

function bindBundleValue(type) {
  if (type === "捆2" || type === "热门") return 2;
  if (type === "捆1") return 1;
  return 0;
}

function itemQuantityMap(itemText) {
  const map = new Map();
  String(itemText || "")
    .split(/[;；]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const match = part.match(/^(.*)x([0-9.]+)$/i);
      const name = match ? match[1] : part;
      const quantity = match ? Number(match[2]) : 1;
      map.set(name, (Number(map.get(name)) || 0) + quantity);
    });
  return map;
}

function itemRuleForName(state, itemName) {
  const catalogItem = (state.itemCatalog || []).find((item) => item.name === itemName);
  return normalizeBindType(state.itemRules?.[itemName] || catalogItem?.type || "不捆");
}

function itemCategoryForName(state, itemName) {
  return (state.itemCatalog || []).find((item) => item.name === itemName)?.category || "";
}

function memberBindEntries(state, member) {
  if (!member) return [];
  const entries = [];
  itemQuantityMap(member.item).forEach((quantity, name) => {
    const type = itemRuleForName(state, name);
    if (bindRank(type) <= 0) return;
    entries.push({
      name,
      quantity: Number(quantity) || 0,
      type,
      category: itemCategoryForName(state, name),
      bundle: (Number(quantity) || 0) * bindBundleValue(type),
    });
  });
  return entries;
}

function memberBindUnitCount(state, member) {
  return memberBindEntries(state, member).reduce((total, entry) => total + entry.quantity, 0);
}

function memberBaseBundle(state, member) {
  return memberBindEntries(state, member).reduce((total, entry) => total + entry.bundle, 0);
}

function memberRemainingItemMap(state, member) {
  const map = new Map();
  let credit = memberReduction(state, member.id);
  memberBindEntries(state, member).forEach((entry) => {
    const used = Math.min(entry.bundle, credit);
    credit -= used;
    const remaining = Math.max(0, entry.bundle - used);
    if (remaining > 0) map.set(entry.name, trimNumber(remaining));
  });
  return map;
}

function statusClass(status) {
  if (status === "已确认") return "confirmed";
  if (status === "无效" || status === "未通过" || status === "无效推车") return "invalid";
  return "pending";
}

function statusText(status) {
  if (status === "已确认") return "通过";
  if (status === "无效推车") return "无效推车";
  if (status === "无效" || status === "未通过") return "未通过";
  return status;
}

function proofImageMarkup(record) {
  if (!record.proofImageData) return "";
  return `
    <a class="proof-thumb" href="${record.proofImageData}" target="_blank" rel="noreferrer">
      <img src="${record.proofImageData}" alt="${escapeHtml(record.proofImageName || "推车截图")}" />
      <span>${escapeHtml(record.proofImageName || "查看截图")}</span>
    </a>
  `;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1800);
}

function trimNumber(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, "").replace(/\.$/, "");
}
