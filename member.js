let state = loadState();
let savedMemberName = localStorage.getItem("car-current-member-name") || "";
let selectedProofImage = null;

const els = {
  cloudStatus: document.querySelector("#cloudStatus"),
  cloudGroupCode: document.querySelector("#cloudGroupCode"),
  cloudConnectBtn: document.querySelector("#cloudConnectBtn"),
  memberCloudPanel: document.querySelector("#memberCloudPanel"),
  memberConnectedBar: document.querySelector("#memberConnectedBar"),
  connectedGroupLabel: document.querySelector("#connectedGroupLabel"),
  memberSwitchBtn: document.querySelector("#memberSwitchBtn"),
  memberExitBtn: document.querySelector("#memberExitBtn"),
  boxSelect: document.querySelector("#boxSelect"),
  meSelect: document.querySelector("#meSelect"),
  mySummary: document.querySelector("#mySummary"),
  targetField: document.querySelector("#targetField"),
  targetSelect: document.querySelector("#targetSelect"),
  claimType: document.querySelector("#claimType"),
  proofInput: document.querySelector("#proofInput"),
  proofImage: document.querySelector("#proofImage"),
  proofImageName: document.querySelector("#proofImageName"),
  addRecordBtn: document.querySelector("#addRecordBtn"),
  confirmList: document.querySelector("#confirmList"),
  confirmCount: document.querySelector("#confirmCount"),
  myRecordList: document.querySelector("#myRecordList"),
  myRecordCount: document.querySelector("#myRecordCount"),
};

function currentMember() {
  const name = els.meSelect.value.trim();
  const matched = memberByName(state, name);
  if (matched) return matched;
  if (!name) return null;
  return {
    id: `manual-${name}`,
    name,
    item: "未导入",
    type: "不捆",
    isManual: true,
  };
}

function renderSelects() {
  if (!els.meSelect.value && savedMemberName) els.meSelect.value = savedMemberName;
  // Populate datalists with member names
  const names = state.members.map((m) => m.name);
  const nameOptions = names.map((n) => `<option value="${escapeHtml(n)}">`).join("");
  const meList = document.querySelector("#memberSuggestions");
  const targetList = document.querySelector("#targetSuggestions");
  if (meList) meList.innerHTML = nameOptions;
  if (targetList) targetList.innerHTML = nameOptions;
}

function updateClaimTypeFields() {
  const isInvalid = els.claimType.value === "无效推车";
  els.targetField.classList.toggle("is-hidden", isInvalid);
  els.targetSelect.disabled = isInvalid;
}

function renderSummary() {
  const me = currentMember();
  if (!me) {
    els.mySummary.innerHTML = `<div class="empty">输入cn后可以先提交推车</div>`;
    return;
  }
  if (me.isManual) {
    els.mySummary.innerHTML = `
      <div class="summary-card">
        <span class="tag normal">未导入</span>
        <strong>${escapeHtml(me.name)}</strong>
        <p>排表导入后会按昵称自动对上</p>
      </div>
    `;
    return;
  }
  const bundle = memberBundle(state, me);
  const reduction = memberReduction(state, me.id);
  els.mySummary.innerHTML = `
    <div class="summary-card">
      <span class="tag ${tagClass(me.type)}">${me.type}</span>
      <strong>${escapeHtml(me.name)}｜${escapeHtml(me.item)}</strong>
      <p>有效推车数量：${trimNumber(reduction)}</p>
      <p class="${bundle === 0 ? "bundle-zero" : bundle >= 2 ? "bundle-two" : ""}">捆物剩余：${bundle === 0 ? "不捆" : trimNumber(bundle)}</p>
    </div>
  `;
}

function confirmCard(record) {
  const pusher = memberById(state, record.pusherId);
  const pusherName = pusher?.name || record.pusherName || "未知";
  return `
    <article class="record-card">
      <div class="record-top">
        <strong>${escapeHtml(pusherName)} 说 TA 推了你</strong>
        <span class="status ${statusClass(record.status)}">${statusText(record.status)}</span>
      </div>
      <div class="record-meta">
        <span>${record.claimType}</span>
        <span>${escapeHtml(record.proof || "没有填写凭证")}</span>
        <span class="record-time">${formatTime(record.createdAt)}</span>
      </div>
      ${proofImageMarkup(record)}
      <div class="record-actions">
        <button class="mini-button confirm" data-action="confirm-target" data-id="${record.id}" type="button">确认是 TA 推来的</button>
        <button class="mini-button reject" data-action="reject-target" data-id="${record.id}" type="button">不是 TA 推来的</button>
      </div>
    </article>
  `;
}

function myRecordCard(record) {
  const target = memberById(state, record.targetId);
  const targetName = target?.name || record.targetName || "未知";
  const title = record.claimType === "无效推车" ? "我申报无效推车" : `我推 ${escapeHtml(targetName)}`;
  const confirmText = memberRecordConfirmText(record);
  const claimOptions = ["有效推车", "无效推车"]
    .map((opt) => `<option value="${opt}" ${record.claimType === opt ? "selected" : ""}>${opt}</option>`)
    .join("");
  return `
    <article class="record-card" id="record-${record.id}">
      <div class="record-view">
        <div class="record-top">
          <strong>${title}</strong>
          <span class="status ${statusClass(record.status)}">${statusText(record.status)}</span>
        </div>
        <div class="record-meta">
          <span>${record.claimType}</span>
          <span>${confirmText}</span>
          <span class="record-time">${formatTime(record.createdAt)}</span>
        </div>
        <p>${escapeHtml(record.proof || "没有填写凭证")}</p>
        ${proofImageMarkup(record)}
        <div class="record-actions">
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

function memberRecordConfirmText(record) {
  if (record.claimType === "无效推车") return "无需被推人确认，等团长审核";
  if (!record.targetConfirmed) return "待被推人确认";
  if (record.status === "待审核") return "被推人已确认，等团长审核";
  if (record.status === "已确认") return "团长已通过";
  if (record.status === "未通过") return "未通过";
  return "被推人已确认";
}

function renderRecords() {
  const me = currentMember();
  if (!me) {
    els.confirmCount.textContent = "0 条";
    els.myRecordCount.textContent = "0 条";
    els.confirmList.innerHTML = `<div class="empty">输入cn后查看确认</div>`;
    els.myRecordList.innerHTML = `<div class="empty">输入cn后查看提交记录</div>`;
    return;
  }
  const toConfirm = state.records.filter((record) => (record.targetId === me.id || record.targetName === me.name) && record.status === "待确认");
  const mine = state.records.filter((record) => record.pusherId === me.id || record.pusherName === me.name);
  els.confirmCount.textContent = `${toConfirm.length} 条`;
  els.myRecordCount.textContent = `${mine.length} 条`;
  els.confirmList.innerHTML = toConfirm.length ? toConfirm.map(confirmCard).join("") : `<div class="empty">没有需要你确认的推车</div>`;
  els.myRecordList.innerHTML = mine.length ? mine.map(myRecordCard).join("") : `<div class="empty">你还没有提交推车</div>`;
}

function render() {
  state = normalizeState(state);
  renderCloudControls();
  renderBoxControls();
  renderSelects();
  updateClaimTypeFields();
  renderSummary();
  renderRecords();
}

function renderBoxControls() {
  const boxes = state.boxes || [];
  els.boxSelect.innerHTML = boxes
    .map((box) => `<option value="${escapeHtml(box.id)}">${escapeHtml(box.name)}</option>`)
    .join("");
  els.boxSelect.value = state.activeBoxId || boxes[0]?.id || "";
}

function renderCloudControls() {
  const config = cloudConfig();
  if (!els.cloudGroupCode.value && config.groupCode) els.cloudGroupCode.value = config.groupCode;
  const unlocked = isCloudReady(config) && config.role === "member";
  els.memberCloudPanel.classList.toggle("is-hidden", unlocked);
  els.memberConnectedBar.classList.toggle("is-hidden", !unlocked);
  if (unlocked && els.connectedGroupLabel) {
    els.connectedGroupLabel.textContent = config.groupCode;
  }
  els.cloudStatus.textContent = unlocked ? "已连接" : "未连接";
}

async function connectMemberCloud() {
  const groupCode = els.cloudGroupCode.value.trim();
  if (!groupCode) {
    showToast("请先填写团号");
    return;
  }

  els.cloudConnectBtn.disabled = true;
  try {
    setCloudConfig({ groupCode, role: "member" });
    state = adoptCloudState(await loadCloudState(groupCode));
    render();
    showToast("已连接云端");
  } catch (error) {
    console.error(error);
    clearCloudConfig();
    renderCloudControls();
    showToast(error.message || "连接失败");
  } finally {
    els.cloudConnectBtn.disabled = false;
  }
}

async function loadCloudOnStart() {
  const config = cloudConfig();
  if (!isCloudReady(config) || config.role !== "member") {
    renderCloudControls();
    return;
  }
  try {
    state = adoptCloudState(await loadCloudState(config.groupCode));
    render();
    showToast("已载入云端数据");
  } catch (error) {
    console.error(error);
    showToast("云端载入失败，先显示本地缓存");
    renderCloudControls();
  }
}

async function refreshCloudBeforeWrite() {
  const config = cloudConfig();
  if (!isCloudReady(config) || config.role !== "member") return;
  state = adoptCloudState(await loadCloudState(config.groupCode));
}

async function uploadImageToServer(dataUrl) {
  const apiBaseUrl = customApiBaseUrl();
  if (!apiBaseUrl) throw new Error("未连接云服务");
  const result = await customCloudRpc(apiBaseUrl, "car_upload_image", {
    filename: "screenshot.png",
    data: dataUrl,
  });
  if (!result || typeof result.filename !== "string" || !result.filename) {
    throw new Error("上传返回数据异常");
  }
  return result.filename;
}

async function submitRecord() {
  try {
    await refreshCloudBeforeWrite();
  } catch (error) {
    console.error(error);
    showToast("云端刷新失败，请稍后再交");
    return;
  }
  const me = currentMember();
  if (!me) {
    showToast("请先输入cn");
    return;
  }
  const isInvalid = els.claimType.value === "无效推车";
  const targetName = els.targetSelect.value.trim();
  const target = memberByName(state, targetName);
  if (!isInvalid && !targetName) {
    showToast("请填写被推来的人");
    return;
  }
  if (!isInvalid && me.name === targetName) {
    showToast("不能把自己填成被推来的人");
    return;
  }
  state = addRecord({
    pusherId: me.isManual ? "" : me.id,
    pusherName: me.name,
    targetId: isInvalid || !target ? "" : target.id,
    targetName: isInvalid ? "" : targetName,
    claimType: els.claimType.value,
    proof: els.proofInput.value.trim(),
    proofImageName: selectedProofImage?.name || "",
    proofImageData: selectedProofImage?.dataUrl || "",
    proofImageUrl: selectedProofImage?.serverUrl || "",
    status: isInvalid ? "待审核" : "待确认",
    targetConfirmed: false,
  });
  els.proofInput.value = "";
  els.proofImage.value = "";
  els.proofImageName.textContent = "可上传群聊截图或社媒截图";
  selectedProofImage = null;
  render();
  showToast(isInvalid ? "已提交，等待团长审核" : "已提交，等待被推人确认");
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;

  // Actions that need cloud refresh first
  if (["confirm-target", "reject-target", "save-edit", "delete"].includes(button.dataset.action)) {
    try {
      await refreshCloudBeforeWrite();
    } catch (error) {
      console.error(error);
      showToast("云端刷新失败，请稍后再试");
      return;
    }
  }

  if (button.dataset.action === "confirm-target") {
    const rec = state.records.find((r) => r.id === id);
    if (rec) { rec.targetConfirmed = true; rec.status = "待审核"; }
    showToast("已确认，等待团长审核");
  }
  if (button.dataset.action === "reject-target") {
    const rec = state.records.find((r) => r.id === id);
    if (rec) { rec.targetConfirmed = false; rec.status = "未通过"; }
    showToast("已标记为未通过");
  }

  // Delete
  if (button.dataset.action === "delete") {
    if (!window.confirm("确定删除这条推车记录吗？删除后不可恢复。")) return;
    state.records = state.records.filter((r) => r.id !== id);
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
    if (claimType === "无效推车") {
      patch.targetName = "";
      patch.targetId = "";
      patch.targetConfirmed = false;
    }
    const rec = state.records.find((r) => r.id === id);
    if (rec) Object.assign(rec, patch);
    saveState(state);
    showToast("已保存修改");
  }

  render();
});

els.meSelect.addEventListener("input", () => {
  savedMemberName = els.meSelect.value.trim();
  localStorage.setItem("car-current-member-name", savedMemberName);
  render();
});
els.cloudConnectBtn.addEventListener("click", connectMemberCloud);
els.memberSwitchBtn.addEventListener("click", () => {
  els.memberCloudPanel.classList.remove("is-hidden");
  els.memberConnectedBar.classList.add("is-hidden");
});
els.memberExitBtn.addEventListener("click", () => {
  clearCloudConfig();
  renderCloudControls();
  showToast("已退出，刷新后需重新配置");
});
els.boxSelect.addEventListener("change", () => {
  state = setActiveBox(els.boxSelect.value);
  render();
});
els.claimType.addEventListener("change", updateClaimTypeFields);
els.proofImage.addEventListener("change", () => {
  const file = els.proofImage.files?.[0];
  if (!file) {
    selectedProofImage = null;
    els.proofImageName.textContent = "可上传群聊截图或社媒截图";
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    els.proofImage.value = "";
    selectedProofImage = null;
    els.proofImageName.textContent = "可上传群聊截图或社媒截图";
    showToast("截图太大了，请上传 5MB 以内的图片");
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", async () => {
    const dataUrl = String(reader.result || "");
    selectedProofImage = {
      name: file.name,
      dataUrl: dataUrl,
      serverUrl: null,
    };
    els.proofImageName.textContent = "正在上传截图...";
    try {
      const filename = await uploadImageToServer(dataUrl);
      selectedProofImage.serverUrl = "/car-uploads/" + filename;
      els.proofImageName.textContent = `已选择：${file.name}`;
    } catch (error) {
      console.warn("截图上传服务器失败，使用本地存储", error);
      els.proofImageName.textContent = `已选择：${file.name}（仅本地）`;
    }
  });
  reader.addEventListener("error", () => {
    selectedProofImage = null;
    showToast("截图读取失败，请重新上传");
  });
  reader.readAsDataURL(file);
});
els.addRecordBtn.addEventListener("click", submitRecord);

window.addEventListener("storage", () => {
  state = loadState();
  render();
});

render();
setupAutoRefresh(() => render(), 60);
loadCloudOnStart();
