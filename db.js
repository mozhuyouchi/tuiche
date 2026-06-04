const CAR_DB_KEY = "car-push-tool-v2";
const CAR_CLOUD_KEY = "car-cloud-config-v1";
const CAR_ACTIVE_BOX_KEY = "car-active-box-id-v1";
const CUSTOM_API_BASE_URL = "/car-api";
const SUPABASE_URL = "https://uvfecqqfrxsfmdtvxydz.supabase.co";
const SUPABASE_PUBLIC_KEY = "sb_publishable_Qo39DhmeDPub_TMs3WtGHw_eXlLfTMT";

const demoRosterText = `昵称,款式,类型
阿乖,胀相,不捆
龙虾,五条,不捆
凸凸,乙骨,不捆
星星,真依x10,捆物
别静音,惠x3,捆物
阿娇,五条,不捆`;

const defaultKeywordRules = {
  hot: "五条",
  cold: "",
};

const legacyRemovedStatus = "\u4e89\u8bae";
const boxFieldKeys = ["members", "keywordRules", "itemRules", "itemCatalog", "records", "allocationAssignments", "allocationExcludedIds"];

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

function defaultBox(name = "默认盲盒") {
  const members = parseRoster(demoRosterText, defaultKeywordRules);
  const byName = Object.fromEntries(members.map((member) => [member.name, member]));
  return {
    id: makeId("box"),
    name,
    members,
    keywordRules: { ...defaultKeywordRules },
    itemRules: { 五条: "捆2", 真依: "捆物", 惠: "捆物" },
    itemCatalog: [
      { name: "五条", category: "", price: 73.5, type: "捆2" },
      { name: "真依", category: "", price: 4.5, type: "捆物" },
      { name: "惠", category: "", price: 0, type: "捆物" },
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
    allocationAssignments: {},
    allocationExcludedIds: [],
  };
}

function defaultState() {
  const box = defaultBox("默认盲盒");
  return normalizeState({
    boxes: [box],
    activeBoxId: box.id,
  });
}

function loadState() {
  const saved = localStorage.getItem(CAR_DB_KEY);
  if (!saved) {
    const state = defaultState();
    saveState(state);
    return state;
  }
  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    const state = defaultState();
    saveState(state);
    return state;
  }
}

function saveState(state) {
  // Sync flat records back into the active box so normalizeState doesn't overwrite them
  if (state.boxes && state.records) {
    const activeBox = state.boxes.find((b) => b.id === state.activeBoxId);
    if (activeBox) activeBox.records = state.records;
  }
  const storageState = stateForStorage(state);
  localStorage.setItem(CAR_DB_KEY, JSON.stringify(storageState));
  localStorage.setItem(CAR_ACTIVE_BOX_KEY, storageState.activeBoxId);
  window._carLastModified = Date.now();
  queueCloudSave(storageState);
}

function normalizeState(state = {}) {
  const boxes = Array.isArray(state.boxes) && state.boxes.length
    ? state.boxes.map((box, index) => normalizeBox(box, `盲盒${index + 1}`))
    : [normalizeBox(state, "默认盲盒")];
  const localActiveBoxId = localStorage.getItem(CAR_ACTIVE_BOX_KEY);
  const activeBoxId = boxes.some((box) => box.id === localActiveBoxId)
    ? localActiveBoxId
    : boxes.some((box) => box.id === state.activeBoxId)
      ? state.activeBoxId
      : boxes[0].id;
  const activeBox = boxes.find((box) => box.id === activeBoxId) || boxes[0];
  return {
    boxes,
    activeBoxId,
    activeBoxName: activeBox.name,
    ...boxFields(activeBox),
  };
}

function normalizeBox(box = {}, fallbackName = "默认盲盒") {
  const records = Array.isArray(box.records)
    ? box.records.map((record) => (record.status === legacyRemovedStatus ? { ...record, status: "未通过" } : record))
    : [];
  return {
    id: box.id || makeId("box"),
    name: String(box.name || fallbackName).trim() || fallbackName,
    members: Array.isArray(box.members)
      ? box.members.map((member) => ({ ...member, type: normalizeBindType(member.type) }))
      : [],
    records,
    keywordRules: box.keywordRules || { ...defaultKeywordRules },
    itemRules: Object.fromEntries(Object.entries(box.itemRules || {}).map(([item, type]) => [item, normalizeBindType(type)])),
    itemCatalog: Array.isArray(box.itemCatalog)
      ? box.itemCatalog.map((item) => ({ ...item, type: normalizeBindType(item.type) }))
      : [],
    allocationAssignments: box.allocationAssignments && typeof box.allocationAssignments === "object" ? box.allocationAssignments : {},
    allocationExcludedIds: Array.isArray(box.allocationExcludedIds) ? box.allocationExcludedIds : [],
  };
}

function boxFields(source) {
  return Object.fromEntries(boxFieldKeys.map((key) => [key, source[key]]));
}

function stateForStorage(state = {}) {
  const boxes = Array.isArray(state.boxes) && state.boxes.length
    ? state.boxes.map((box, index) => normalizeBox(box, `盲盒${index + 1}`))
    : [normalizeBox(state, "默认盲盒")];
  const localActiveBoxId = localStorage.getItem(CAR_ACTIVE_BOX_KEY);
  const activeBoxId = boxes.some((box) => box.id === state.activeBoxId)
    ? state.activeBoxId
    : boxes.some((box) => box.id === localActiveBoxId)
      ? localActiveBoxId
      : boxes[0].id;
  const hasActiveFields = boxFieldKeys.some((key) => Object.prototype.hasOwnProperty.call(state, key));
  const storedBoxes = boxes.map((box) =>
    box.id === activeBoxId && hasActiveFields
      ? normalizeBox({ ...box, name: state.activeBoxName || box.name, ...boxFields(state) }, box.name)
      : box
  );
  return {
    boxes: storedBoxes,
    activeBoxId,
  };
}

function setActiveBox(boxId) {
  const storageState = stateForStorage(loadState());
  const targetBox = storageState.boxes.find((box) => box.id === boxId);
  if (!targetBox) return loadState();
  storageState.activeBoxId = targetBox.id;
  localStorage.setItem(CAR_ACTIVE_BOX_KEY, targetBox.id);
  window.carCloudPauseSave = true;
  localStorage.setItem(CAR_DB_KEY, JSON.stringify(storageState));
  window.carCloudPauseSave = false;
  return normalizeState(storageState);
}

function addBox(name) {
  const storageState = stateForStorage(loadState());
  const newBox = normalizeBox({ id: makeId("box"), name: name || `盲盒${storageState.boxes.length + 1}` }, `盲盒${storageState.boxes.length + 1}`);
  storageState.boxes.push(newBox);
  storageState.activeBoxId = newBox.id;
  return persistStorageState(storageState);
}

function renameActiveBox(name) {
  const storageState = stateForStorage(loadState());
  storageState.boxes = storageState.boxes.map((box) => (box.id === storageState.activeBoxId ? { ...box, name: String(name || box.name).trim() || box.name } : box));
  return persistStorageState(storageState);
}

function deleteActiveBox() {
  const storageState = stateForStorage(loadState());
  if (storageState.boxes.length <= 1) return normalizeState(storageState);
  const index = storageState.boxes.findIndex((box) => box.id === storageState.activeBoxId);
  storageState.boxes = storageState.boxes.filter((box) => box.id !== storageState.activeBoxId);
  storageState.activeBoxId = storageState.boxes[Math.max(0, index - 1)]?.id || storageState.boxes[0].id;
  return persistStorageState(storageState);
}

function persistStorageState(storageState) {
  localStorage.setItem(CAR_ACTIVE_BOX_KEY, storageState.activeBoxId);
  const clean = normalizeState(storageState);
  saveState(clean);
  return clean;
}

function cloudConfig() {
  try {
    return JSON.parse(localStorage.getItem(CAR_CLOUD_KEY) || "{}");
  } catch {
    return {};
  }
}

function setCloudConfig(config) {
  const clean = {
    groupCode: String(config.groupCode || "").trim(),
    adminPin: String(config.adminPin || "").trim(),
    role: config.role === "admin" ? "admin" : "member",
  };
  localStorage.setItem(CAR_CLOUD_KEY, JSON.stringify(clean));
  return clean;
}

function clearCloudConfig() {
  localStorage.removeItem(CAR_CLOUD_KEY);
}

function isCloudReady(config = cloudConfig()) {
  return Boolean(config.groupCode && config.role);
}

async function cloudRpc(functionName, body) {
  const apiBaseUrl = customApiBaseUrl();
  if (apiBaseUrl) return customCloudRpc(apiBaseUrl, functionName, body);
  return supabaseRpc(functionName, body);
}

function customApiBaseUrl() {
  return String(localStorage.getItem("car-custom-api-base-url") || CUSTOM_API_BASE_URL || "").replace(/\/+$/, "");
}

async function customCloudRpc(apiBaseUrl, functionName, body) {
  const response = await fetch(`${apiBaseUrl}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `云数据库请求失败：${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function supabaseRpc(functionName, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `云数据库请求失败：${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function loadCloudState(groupCode) {
  const remoteState = await cloudRpc("car_get_state", { p_group_code: groupCode });
  return normalizeState(remoteState || {});
}

async function createCloudGroup(groupCode, adminPin, state) {
  const remoteState = await cloudRpc("car_create_group", {
    p_group_code: groupCode,
    p_admin_pin: adminPin,
    p_state: state,
  });
  return normalizeState(remoteState || {});
}

async function saveCloudState(state, config = cloudConfig()) {
  if (!isCloudReady(config)) return false;
  if (config.role === "admin") {
    if (!config.adminPin) return false;
    return cloudRpc("car_admin_save_state", {
      p_group_code: config.groupCode,
      p_admin_pin: config.adminPin,
      p_state: state,
    });
  }
  return cloudRpc("car_member_save_state", {
    p_group_code: config.groupCode,
    p_state: state,
  });
}

function queueCloudSave(state) {
  const config = cloudConfig();
  if (!isCloudReady(config) || window.carCloudPauseSave) return;
  window.clearTimeout(window.carCloudSaveTimer);
  window.carCloudSaveTimer = window.setTimeout(() => {
    saveCloudState(state, config).catch((error) => {
      console.warn("Cloud save failed", error);
      if (typeof showToast === "function") showToast("云端保存失败，稍后再试");
    });
  }, 250);
}

function adoptCloudState(remoteState) {
  const clean = normalizeState(remoteState);
  window.carCloudPauseSave = true;
  saveState(clean);
  window.carCloudPauseSave = false;
  return clean;
}

function replaceMembersFromRoster(text, keywordRules = defaultKeywordRules, itemCatalog = []) {
  const state = loadState();
  state.keywordRules = { ...defaultKeywordRules, ...keywordRules };
  state.itemRules = Object.fromEntries(Object.entries(keywordRules.itemRules || {}).map(([item, type]) => [item, normalizeBindType(type)]));
  state.itemCatalog = itemCatalog.map((item) => ({ ...item, type: normalizeBindType(item.type) }));
  state.members = parseRoster(text, state.keywordRules);
  state.allocationAssignments = {};
  state.allocationExcludedIds = [];
  state.records = state.records.filter((record) => {
    const hasManualName = Boolean(record.pusherName || record.targetName);
    const hasPusher = state.members.some((member) => member.id === record.pusherId || member.name === record.pusherName);
    const hasTarget = !record.targetId || state.members.some((member) => member.id === record.targetId || member.name === record.targetName);
    if (hasManualName) return true;
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

function deleteRecord(id) {
  const state = loadState();
  state.records = state.records.filter((record) => record.id !== id);
  state.allocationAssignments = {};
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

function memberByName(state, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return undefined;
  return state.members.find((member) => member.name === cleanName);
}

function recordPusherMatches(state, record, member) {
  return record.pusherId === member.id || (record.pusherName && record.pusherName === member.name);
}

function recordValue(record) {
  if (record.status === "未通过") return 0;
  if (record.status !== "已确认") return 0;
  if (record.claimType === "无效推车") return 0.5;
  if (record.claimType === "有效推车") return 1;
  if (record.claimType === "小推车多") return 2;
  return 0;
}

function memberReduction(state, memberId) {
  const member = memberById(state, memberId);
  return state.records
    .filter((record) => (member ? recordPusherMatches(state, record, member) : record.pusherId === memberId))
    .reduce((total, record) => total + recordValue(record), 0);
}

function memberBundle(state, member) {
  if (!member) return 0;
  return Math.max(0, memberBaseBundle(state, member) - memberReduction(state, member.id));
}

function memberStateLabel(state, member) {
  const bundle = memberBundle(state, member);
  const records = state.records.filter((record) => recordPusherMatches(state, record, member) && record.status !== "未通过");
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
  if (status === "待审核") return "等审核";
  if (status === "无效推车") return "无效推车";
  if (status === "无效" || status === "未通过") return "未通过";
  return status;
}

function proofImageMarkup(record) {
  const imageUrl = record.proofImageUrl || record.proofImageData;
  if (!imageUrl) return "";
  return `
    <a class="proof-thumb" href="javascript:void(0)" onclick="openLightbox('${escapeHtml(imageUrl)}')" title="点击查看大图">
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(record.proofImageName || "推车截图")}" />
      <span>${escapeHtml(record.proofImageName || "查看截图")}</span>
    </a>
  `;
}

function openLightbox(url) {
  let lb = document.querySelector("#lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "lightbox";
    lb.className = "lightbox";
    lb.innerHTML = '<div class="lightbox-bg"></div><img class="lightbox-img" src="" alt="" /><button class="lightbox-close">&times;</button>';
    document.body.appendChild(lb);
    lb.querySelector(".lightbox-bg").addEventListener("click", closeLightbox);
    lb.querySelector(".lightbox-close").addEventListener("click", closeLightbox);
  }
  lb.querySelector(".lightbox-img").src = url;
  lb.classList.add("show");
}

function closeLightbox() {
  const lb = document.querySelector("#lightbox");
  if (lb) lb.classList.remove("show");
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  return `${Math.floor(seconds / 86400)} 天前`;
}

function setupAutoRefresh(renderFn, intervalSeconds = 60) {
  if (window._carAutoRefreshTimer) clearInterval(window._carAutoRefreshTimer);
  window._carAutoRefreshTimer = setInterval(async () => {
    const config = cloudConfig();
    if (!isCloudReady(config)) return;
    // Skip if local changes were made in the last 3 seconds to avoid overwriting
    if (window._carLastModified && Date.now() - window._carLastModified < 3000) return;
    try {
      const remote = await loadCloudState(config.groupCode);
      if (window._carStatePauseRefresh) return;
      adoptCloudState(remote);
      if (typeof renderFn === "function") renderFn();
    } catch (e) {
      // silent refresh
    }
  }, intervalSeconds * 1000);
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
