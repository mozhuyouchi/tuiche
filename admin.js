let state = loadState();
let pendingItemCatalog = [];

const els = {
  rosterFile: document.querySelector("#rosterFile"),
  cloudStatus: document.querySelector("#cloudStatus"),
  cloudGroupCode: document.querySelector("#cloudGroupCode"),
  cloudAdminPin: document.querySelector("#cloudAdminPin"),
  cloudConnectBtn: document.querySelector("#cloudConnectBtn"),
  adminGateWrap: document.querySelector("#adminGateWrap"),
  adminConnectedBar: document.querySelector("#adminConnectedBar"),
  connectedGroupLabel: document.querySelector("#connectedGroupLabel"),
  adminSwitchBtn: document.querySelector("#adminSwitchBtn"),
  adminExitBtn: document.querySelector("#adminExitBtn"),
  adminContent: document.querySelector("#adminContent"),
  boxSelect: document.querySelector("#boxSelect"),
  boxNameInput: document.querySelector("#boxNameInput"),
  boxCount: document.querySelector("#boxCount"),
  addBoxBtn: document.querySelector("#addBoxBtn"),
  renameBoxBtn: document.querySelector("#renameBoxBtn"),
  deleteBoxBtn: document.querySelector("#deleteBoxBtn"),
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
  allocationFilters: document.querySelectorAll("[data-allocation-filter]"),
  allocationAssignBtn: document.querySelector("#allocationAssignBtn"),
  allocationExportBtn: document.querySelector("#allocationExportBtn"),
  hotCount: document.querySelector("#hotCount"),
  confirmedCount: document.querySelector("#confirmedCount"),
  pendingCount: document.querySelector("#pendingCount"),
};

function renderMembers() {
  els.memberCount.textContent = `${state.members.length} 人`;
  if (!state.members.length) {
    els.memberList.innerHTML = `<div class="empty">还没有导入成员</div>`;
    return;
  }

  const overview = rosterOverview();
  const overviewHtml = `
    <div class="overview-block">
      <span>角色剩余：${escapeHtml(overview.remainingText)}</span>
    </div>
  `;
  const rows = state.members
    .map((member, index) => {
      const bundle = memberBundle(state, member);
      const bindItems = memberBindItems(member);
      const bindReason = bindItems.length ? bindItems.join("、") : "-";
      const baseBundle = memberBaseBundle(state, member);
      const bundleText = baseBundle > 0 ? `<span class="${bundle === 0 ? "bundle-zero" : bundle >= 2 ? "bundle-two" : ""}">${bundle === 0 ? "不捆" : trimNumber(bundle)}</span>` : "-";
      const pushText = memberPushStatus(member);
      const creditText = trimNumber(memberReduction(state, member.id));
      const remainingRoleCell =
        index === 0
          ? `<td class="remaining-role-cell" rowspan="${state.members.length}">${overviewHtml}</td>`
          : "";
      return `
        <tr>
          <td class="exclude-cell">
            <input
              aria-label="${escapeHtml(member.name)} 不参与上捆"
              data-allocation-exclude="${escapeHtml(member.id)}"
              type="checkbox"
              ${isAllocationExcluded(member) ? "checked" : ""}
            />
          </td>
          <td class="name-cell">
            <strong>${escapeHtml(member.name)}</strong>
          </td>
          <td class="hot-reason-cell">${escapeHtml(bindReason)}</td>
          <td class="bundle-cell">${bundleText}</td>
          <td class="push-status-cell">${escapeHtml(pushText)}</td>
          <td class="quantity-cell">${creditText}</td>
          ${remainingRoleCell}
        </tr>
      `;
    })
    .join("");

  els.memberList.innerHTML = `
    <div class="roster-sheet-wrap">
      <table class="roster-sheet roster-matrix">
        <thead>
          <tr>
            <th class="exclude-cell">已带余</th>
            <th>昵称</th>
            <th>list</th>
            <th>被捆数量</th>
            <th>推车状态</th>
            <th>有效推车数量</th>
            <th>总览</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function memberBindItems(member) {
  const entries = [];
  itemQuantityMap(member.item).forEach((quantity, itemName) => {
    const type = itemRuleForName(state, itemName);
    const category = itemCategoryForName(state, itemName);
    entries.push(`${itemName}x${trimNumber(quantity)}｜${type}${category ? `｜${category}` : ""}`);
  });
  return entries;
}

function rosterOverview() {
  const allTotals = new Map();
  const bundleGoodsTotals = new Map();
  state.members.forEach((member) => {
    itemQuantityMap(member.item).forEach((quantity, itemName) => {
      allTotals.set(itemName, (Number(allTotals.get(itemName)) || 0) + Number(quantity));
      if (itemRuleForName(state, itemName) === "捆物") {
        bundleGoodsTotals.set(itemName, (Number(bundleGoodsTotals.get(itemName)) || 0) + Number(quantity));
      }
    });
  });
  const boxItemNames = (state.itemCatalog || []).map((item) => item.name).filter(Boolean);
  const setQuantities = (boxItemNames.length ? boxItemNames : Array.from(allTotals.keys())).map((itemName) => Number(allTotals.get(itemName)) || 0);
  return {
    setCount: setQuantities.length ? Math.min(...setQuantities) : 0,
    remainingText: bundleGoodsTotals.size
      ? Array.from(bundleGoodsTotals.entries())
          .map(([itemName, quantity]) => `${itemName}x${trimNumber(quantity)}`)
          .join("、")
      : "-",
  };
}

function memberPushStatus(member) {
  return memberStateLabel(state, member);
}

function isAllocationExcluded(member) {
  return Array.isArray(state.allocationExcludedIds) && state.allocationExcludedIds.includes(member.id);
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
        map.set(match[1], (Number(map.get(match[1])) || 0) + Number(match[2]));
      } else {
        map.set(part, (Number(map.get(part)) || 0) + 1);
      }
    });
  return map;
}

function recordCard(record) {
  const pusher = memberById(state, record.pusherId);
  const pusherName = pusher?.name || record.pusherName || "未知";
  const target = memberById(state, record.targetId);
  const targetName = target?.name || record.targetName || "未知";
  const title = record.claimType === "无效推车" ? `${escapeHtml(pusherName)} 申报无效推车` : `${escapeHtml(pusherName)} 推 ${escapeHtml(targetName)}`;
  const targetConfirmText = record.targetConfirmed ? "已确认" : "未确认";
  const targetText =
    record.claimType === "无效推车"
      ? "无对应被推人"
      : `被推人：${escapeHtml(targetName)}（${targetConfirmText}）${target ? `｜被推款：${escapeHtml(target.item || "未填")}` : ""}`;
  const creditText = recordCreditText(record);
  const timeText = formatTime(record.createdAt);
  const claimOptions = ["有效推车", "无效推车", "小推车多"]
    .map((opt) => `<option value="${opt}" ${record.claimType === opt ? "selected" : ""}>${opt}</option>`)
    .join("");
  return `
    <article class="record-card record-row-card" id="record-${record.id}">
      <div class="record-view">
        <div>
          <div class="record-top">
            <strong>${title}</strong>
            <span class="status ${statusClass(record.status)}">${statusText(record.status)}</span>
          </div>
          <div class="record-meta record-meta-inline">
            <span>${record.claimType}</span>
            <span>${creditText}</span>
            <span>${targetText}</span>
            <span class="record-time">${escapeHtml(timeText)}</span>
          </div>
          <p>${escapeHtml(record.proof || "没有填写凭证")}</p>
          ${proofImageMarkup(record)}
        </div>
        <div class="record-actions">
          <button class="mini-button confirm" data-action="confirm" data-id="${record.id}" type="button">通过</button>
          <button class="mini-button" data-action="invalid" data-id="${record.id}" type="button">未通过</button>
          <button class="mini-button" data-action="edit" data-id="${record.id}" type="button">编辑</button>
          <button class="mini-button reject" data-action="delete" data-id="${record.id}" type="button">删除</button>
        </div>
      </div>
      <div class="record-edit is-hidden">
        <div class="edit-form">
          <label class="field">
            <span>申报类型</span>
            <select data-edit-field="claimType">${claimOptions}</select>
          </label>
          <label class="field">
            <span>被推来的人</span>
            <input data-edit-field="targetName" type="text" value="${escapeHtml(targetName)}" placeholder="输入对方cn" />
          </label>
          <label class="field wide">
            <span>凭证/备注</span>
            <input data-edit-field="proof" type="text" value="${escapeHtml(record.proof || "")}" placeholder="凭证说明" />
          </label>
          <div class="record-actions">
            <button class="mini-button confirm" data-action="save-edit" data-id="${record.id}" type="button">保存</button>
            <button class="mini-button" data-action="cancel-edit" data-id="${record.id}" type="button">取消</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function recordCreditText(record) {
  if (record.claimType === "小推车多") return "计 2 个有效推车";
  if (record.claimType === "有效推车") return "计 1 个有效推车";
  return "计 0.5 个有效推车";
}

function renderRecords() {
  const visibleRecords = adminVisibleRecords();
  els.recordCount.textContent = `${visibleRecords.length} 条`;
  els.recordList.innerHTML = visibleRecords.length ? visibleRecords.map(recordCard).join("") : `<div class="empty">还没有推车记录</div>`;
}

function adminVisibleRecords() {
  return state.records;
}

function renderAllocation() {
  const members = filteredAllocationMembers();
  if (!members.length) {
    els.allocationBody.innerHTML = `<tr><td colspan="6" class="empty-table-cell">当前筛选下没有成员</td></tr>`;
    return;
  }
  els.allocationBody.innerHTML = members
    .map((member) => {
      const reduction = memberReduction(state, member.id);
      const bundle = memberBundle(state, member);
      const bundleClass = bundle === 0 ? "bundle-zero" : bundle >= 2 ? "bundle-two" : "";
      const assignedText = allocationAssignmentText(state, member, bundle);
      return `
        <tr>
          <td>${escapeHtml(member.name)}</td>
          <td>${escapeHtml(member.item)}</td>
          <td><span class="tag ${tagClass(member.type)}">${member.type}</span></td>
          <td>${memberBaseBundle(state, member) > 0 ? trimNumber(reduction) : "-"}</td>
          <td>${memberStateLabel(state, member)}</td>
          <td class="${bundleClass}">${assignedText}</td>
        </tr>
      `;
    })
    .join("");
}

function allocationAssignmentText(state, member, bundle) {
  const assigned = state.allocationAssignments?.[member.id];
  if (Array.isArray(assigned) && assigned.length) {
    return assigned.map((item) => `${escapeHtml(item.name)}x${trimNumber(item.quantity)}`).join("、");
  }
  return bundle === 0 ? "不捆" : trimNumber(bundle);
}

function assignRemainingBundles() {
  const recipients = filteredAllocationMembers().filter((member) => memberBundle(state, member) > 0);
  if (!recipients.length) {
    state.allocationAssignments = {};
    saveState(state);
    renderAllocation();
    showToast("当前筛选下没有需要上捆的人");
    return;
  }

  const pool = remainingBundlePool();
  if (!pool.some((item) => item.quantity > 0)) {
    state.allocationAssignments = {};
    saveState(state);
    renderAllocation();
    showToast("没有可分配的捆物");
    return;
  }

  const slots = shuffle(
    recipients.flatMap((member) => {
      const memberSlots = [];
      let remaining = memberBundle(state, member);
      while (remaining > 0) {
        const quantity = Math.min(1, remaining);
        memberSlots.push({ memberId: member.id, quantity });
        remaining = trimFloat(remaining - quantity);
      }
      return memberSlots;
    })
  );

  const assignments = {};
  slots.forEach((slot) => {
    const available = pool.filter((item) => item.quantity > 0);
    if (!available.length) return;
    const picked = available[Math.floor(Math.random() * available.length)];
    const quantity = Math.min(slot.quantity, picked.quantity);
    picked.quantity = trimFloat(picked.quantity - quantity);
    if (!assignments[slot.memberId]) assignments[slot.memberId] = [];
    assignments[slot.memberId].push({ name: picked.name, quantity });
  });

  state.allocationAssignments = Object.fromEntries(
    Object.entries(assignments).map(([memberId, items]) => [memberId, mergeAssignedItems(items)])
  );
  saveState(state);
  renderAllocation();
  showToast("已随机上捆");
}

function remainingBundlePool() {
  const totals = new Map();
  state.members.forEach((member) => {
    itemQuantityMap(member.item).forEach((quantity, itemName) => {
      if (itemRuleForName(state, itemName) !== "捆物") return;
      totals.set(itemName, (Number(totals.get(itemName)) || 0) + Number(quantity));
    });
  });
  return Array.from(totals.entries()).map(([name, quantity]) => ({ name, quantity: Number(quantity) || 0 }));
}

function mergeAssignedItems(items) {
  const totals = new Map();
  items.forEach((item) => totals.set(item.name, (Number(totals.get(item.name)) || 0) + Number(item.quantity)));
  return Array.from(totals.entries()).map(([name, quantity]) => ({ name, quantity: trimFloat(quantity) }));
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function trimFloat(value) {
  return Number(Number(value).toFixed(6));
}

function allocationFilterTypes() {
  return Array.from(els.allocationFilters)
    .filter((input) => input.checked)
    .map((input) => input.dataset.allocationFilter);
}

function filteredAllocationMembers() {
  const allowedTypes = allocationFilterTypes();
  return state.members
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => allowedTypes.includes(normalizeBindType(member.type)) && !isAllocationExcluded(member))
    .sort((a, b) => {
      const rankDiff = bindRank(normalizeBindType(b.member.type)) - bindRank(normalizeBindType(a.member.type));
      return rankDiff || a.index - b.index;
    })
    .map(({ member }) => member);
}

function renderSummary() {
  const bundledMembers = state.members.filter((member) => memberBaseBundle(state, member) > 0);
  const submittedBundledMembers = bundledMembers.filter((member) => state.records.some((record) => record.pusherId === member.id));
  const pendingReviewCount = state.records.filter((r) => r.status === "待审核").length;
  els.hotCount.textContent = state.members
    .reduce((total, member) => total + memberBundle(state, member), 0);
  els.confirmedCount.textContent = submittedBundledMembers.length;
  els.pendingCount.textContent = bundledMembers.length - submittedBundledMembers.length;
  const reviewEl = document.querySelector("#pendingReviewCount");
  if (reviewEl) reviewEl.textContent = pendingReviewCount;
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
  state = ensureBoxState(state);
  renderCloudControls();
  renderBoxControls();
  if (document.activeElement !== els.rosterInput) {
    els.rosterInput.value = rosterTextFromMembers();
  }
  if (!pendingItemCatalog.length) renderItemRules(state.itemCatalog || []);
  renderMembers();
  renderRecords();
  renderAllocation();
  renderSummary();
}

function renderBoxControls() {
  state = ensureBoxState(state);
  const boxes = state.boxes || [];
  els.boxCount.textContent = `${boxes.length} 个`;
  els.boxSelect.innerHTML = boxes
    .map((box) => `<option value="${escapeHtml(box.id)}">${escapeHtml(box.name)}</option>`)
    .join("");
  els.boxSelect.value = state.activeBoxId || boxes[0]?.id || "";
  if (document.activeElement !== els.boxNameInput) {
    els.boxNameInput.value = state.activeBoxName || "";
  }
  els.deleteBoxBtn.disabled = boxes.length <= 1;
}

function ensureBoxState(nextState) {
  const normalized = normalizeState(nextState);
  if (!Array.isArray(normalized.boxes) || !normalized.boxes.length) {
    return normalizeState(defaultState());
  }
  if (!Array.isArray(nextState.boxes) || !nextState.boxes.length) {
    window.carCloudPauseSave = true;
    saveState(normalized);
    window.carCloudPauseSave = false;
  }
  return normalized;
}

function renderCloudControls() {
  const config = cloudConfig();
  if (!els.cloudGroupCode.value && config.groupCode) els.cloudGroupCode.value = config.groupCode;
  if (!els.cloudAdminPin.value && config.adminPin) els.cloudAdminPin.value = config.adminPin;
  const unlocked = isCloudReady(config) && config.role === "admin";
  els.adminGateWrap.classList.toggle("is-hidden", unlocked);
  els.adminConnectedBar.classList.toggle("is-hidden", !unlocked);
  if (unlocked && els.connectedGroupLabel) {
    els.connectedGroupLabel.textContent = config.groupCode;
  }
  els.cloudStatus.textContent = unlocked ? "已连接" : "未连接";
  els.adminContent.classList.toggle("is-hidden", !unlocked);
}

async function connectAdminCloud() {
  const groupCode = els.cloudGroupCode.value.trim();
  const adminPin = els.cloudAdminPin.value.trim();
  if (!groupCode) {
    showToast("请先填写团号");
    return;
  }
  if (!adminPin) {
    showToast("请设置管理密码");
    return;
  }

  els.cloudConnectBtn.disabled = true;
  try {
    const remoteState = await createCloudGroup(groupCode, adminPin, loadState());
    setCloudConfig({ groupCode, adminPin, role: "admin" });
    state = adoptCloudState(remoteState);
    pendingItemCatalog = [];
    render();
    showToast("已进入管理端");
  } catch (error) {
    console.error(error);
    showToast(error.message || "连接失败");
  } finally {
    els.cloudConnectBtn.disabled = false;
  }
}

async function loadCloudOnStart() {
  const config = cloudConfig();
  if (!isCloudReady(config) || config.role !== "admin") {
    renderCloudControls();
    return;
  }
  try {
    state = adoptCloudState(await loadCloudState(config.groupCode));
    pendingItemCatalog = [];
    render();
    showToast("已载入云端数据");
  } catch (error) {
    console.error(error);
    showToast("云端载入失败，先显示本地缓存");
    renderCloudControls();
  }
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
                <option value="捆物" ${savedType === "捆物" ? "selected" : ""}>捆物</option>
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
  const id = button.dataset.id;

  // Approve / Reject
  if (button.dataset.action === "confirm" || button.dataset.action === "invalid") {
    const statusMap = { confirm: "已确认", invalid: "未通过" };
    const record = state.records.find((r) => r.id === id);
    if (record) record.status = statusMap[button.dataset.action];
    state.allocationAssignments = {};
    saveState(state);
    render();
    showToast(`已标记为${statusText(statusMap[button.dataset.action])}`);
    return;
  }

  // Delete
  if (button.dataset.action === "delete") {
    if (!window.confirm("确定删除这条推车记录吗？删除后不可恢复。")) return;
    state.records = state.records.filter((r) => r.id !== id);
    state.allocationAssignments = {};
    saveState(state);
    render();
    showToast("已删除记录");
    return;
  }

  // Enter edit mode
  if (button.dataset.action === "edit") {
    const card = document.querySelector(`#record-${id}`);
    if (card) {
      card.querySelector(".record-view").classList.add("is-hidden");
      card.querySelector(".record-edit").classList.remove("is-hidden");
    }
    return;
  }

  // Cancel edit
  if (button.dataset.action === "cancel-edit") {
    const card = document.querySelector(`#record-${id}`);
    if (card) {
      card.querySelector(".record-view").classList.remove("is-hidden");
      card.querySelector(".record-edit").classList.add("is-hidden");
    }
    return;
  }

  // Save edit
  if (button.dataset.action === "save-edit") {
    const card = document.querySelector(`#record-${id}`);
    if (!card) return;
    const claimType = card.querySelector("[data-edit-field='claimType']").value;
    const targetName = card.querySelector("[data-edit-field='targetName']").value.trim();
    const proof = card.querySelector("[data-edit-field='proof']").value.trim();
    const target = memberByName(state, targetName);
    const patch = {
      claimType,
      proof,
      targetName: targetName || undefined,
      targetId: target ? target.id : "",
    };
    // If claim type changed to 无效推车, clear target
    if (claimType === "无效推车") {
      patch.targetName = "";
      patch.targetId = "";
      patch.targetConfirmed = false;
    }
    const record = state.records.find((r) => r.id === id);
    if (record) Object.assign(record, patch);
    state.allocationAssignments = {};
    saveState(state);
    render();
    showToast("已保存修改");
    return;
  }
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

els.cloudConnectBtn.addEventListener("click", connectAdminCloud);
els.adminSwitchBtn.addEventListener("click", () => {
  els.adminGateWrap.classList.remove("is-hidden");
  els.adminConnectedBar.classList.add("is-hidden");
  els.adminContent.classList.add("is-hidden");
});
els.adminExitBtn.addEventListener("click", () => {
  clearCloudConfig();
  renderCloudControls();
  showToast("已退出管理端");
});

els.boxSelect.addEventListener("change", () => {
  state = setActiveBox(els.boxSelect.value);
  pendingItemCatalog = [];
  render();
});

els.addBoxBtn.addEventListener("click", () => {
  const typedName = els.boxNameInput.value.trim();
  const currentName = state.activeBoxName || "";
  const name = typedName && typedName !== currentName
    ? typedName
    : window.prompt("新盲盒名称", `盲盒${(state.boxes || []).length + 1}`);
  if (!name) return;
  state = addBox(name);
  pendingItemCatalog = [];
  render();
  showToast("已新增盲盒");
});

els.renameBoxBtn.addEventListener("click", () => {
  const name = els.boxNameInput.value.trim();
  if (!name) {
    showToast("请填写盲盒名称");
    return;
  }
  state = renameActiveBox(name);
  render();
  showToast("已重命名盲盒");
});

els.deleteBoxBtn.addEventListener("click", () => {
  if ((state.boxes || []).length <= 1) {
    showToast("至少保留一个盲盒");
    return;
  }
  if (!window.confirm(`确定删除「${state.activeBoxName}」吗？这个盲盒里的排表和推车记录都会删除。`)) return;
  state = deleteActiveBox();
  pendingItemCatalog = [];
  render();
  showToast("已删除盲盒");
});

els.memberList.addEventListener("change", (event) => {
  const input = event.target.closest("[data-allocation-exclude]");
  if (!input) return;

  const excludedIds = new Set(state.allocationExcludedIds || []);
  if (input.checked) {
    excludedIds.add(input.dataset.allocationExclude);
    delete state.allocationAssignments?.[input.dataset.allocationExclude];
  } else {
    excludedIds.delete(input.dataset.allocationExclude);
  }
  state.allocationExcludedIds = Array.from(excludedIds);
  saveState(state);
  renderAllocation();
});

els.allocationFilters.forEach((input) => input.addEventListener("change", renderAllocation));
els.allocationAssignBtn.addEventListener("click", assignRemainingBundles);
els.allocationExportBtn.addEventListener("click", exportAllocation);

function exportAllocation() {
  const members = filteredAllocationMembers();
  if (!members.length) { showToast("没有可导出的数据"); return; }
  const lines = ["成员,吃款,捆序,有效推车数量,状态,捆物剩余"];
  members.forEach((m) => {
    const reduction = memberReduction(state, m.id);
    const bundle = memberBundle(state, m);
    const assigned = allocationAssignmentText(state, m, bundle);
    lines.push(`${m.name},${(m.item || "").replace(/,/g,";")},${m.type},${memberBaseBundle(state,m)>0?trimNumber(reduction):"-"},${memberStateLabel(state,m)},${assigned}`);
  });
  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `捆物表_${state.activeBoxName || "export"}.csv`;
  a.click(); URL.revokeObjectURL(url);
  showToast("已导出 CSV");
}

window.addEventListener("storage", () => {
  window._carStatePauseRefresh = true;
  state = loadState();
  window._carStatePauseRefresh = false;
  render();
});

render();
loadCloudOnStart();
setupAutoRefresh(() => {
  pendingItemCatalog = [];
  render();
}, 60);

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
