let state = loadState();
let currentMemberId = localStorage.getItem("car-current-member") || state.members[0]?.id || "";
let selectedProofImage = null;

const els = {
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
  return memberById(state, currentMemberId) || state.members[0];
}

function renderSelects() {
  const options = state.members
    .map((member) => `<option value="${member.id}">${escapeHtml(member.name)}｜${escapeHtml(member.item)}</option>`)
    .join("");
  els.meSelect.innerHTML = options;
  els.targetSelect.innerHTML = options;
  els.meSelect.value = currentMember()?.id || "";
}

function updateClaimTypeFields() {
  const isInvalid = els.claimType.value === "无效推车";
  els.targetField.classList.toggle("is-hidden", isInvalid);
  els.targetSelect.disabled = isInvalid;
}

function renderSummary() {
  const me = currentMember();
  if (!me) {
    els.mySummary.innerHTML = `<div class="empty">团长还没有导入排表</div>`;
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
  return `
    <article class="record-card">
      <div class="record-top">
        <strong>${escapeHtml(pusher?.name || "未知")} 说 TA 推了你</strong>
        <span class="status ${statusClass(record.status)}">${statusText(record.status)}</span>
      </div>
      <div class="record-meta">
        <span>${record.claimType}</span>
        <span>${escapeHtml(record.proof || "没有填写凭证")}</span>
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
  const title = record.claimType === "无效推车" ? "我申报无效推车" : `我推 ${escapeHtml(target?.name || "未知")}`;
  const confirmText = record.claimType === "无效推车" ? "无需被推人确认" : record.targetConfirmed ? "被推人已确认" : "待被推人确认";
  return `
    <article class="record-card">
      <div class="record-top">
        <strong>${title}</strong>
        <span class="status ${statusClass(record.status)}">${statusText(record.status)}</span>
      </div>
      <div class="record-meta">
        <span>${record.claimType}</span>
        <span>${confirmText}</span>
      </div>
      <p>${escapeHtml(record.proof || "没有填写凭证")}</p>
      ${proofImageMarkup(record)}
    </article>
  `;
}

function renderRecords() {
  const me = currentMember();
  if (!me) {
    els.confirmList.innerHTML = `<div class="empty">暂无排表</div>`;
    els.myRecordList.innerHTML = `<div class="empty">暂无排表</div>`;
    return;
  }
  const toConfirm = state.records.filter((record) => record.targetId === me.id && record.status === "待确认");
  const mine = state.records.filter((record) => record.pusherId === me.id);
  els.confirmCount.textContent = `${toConfirm.length} 条`;
  els.myRecordCount.textContent = `${mine.length} 条`;
  els.confirmList.innerHTML = toConfirm.length ? toConfirm.map(confirmCard).join("") : `<div class="empty">没有需要你确认的推车</div>`;
  els.myRecordList.innerHTML = mine.length ? mine.map(myRecordCard).join("") : `<div class="empty">你还没有提交推车</div>`;
}

function render() {
  renderSelects();
  updateClaimTypeFields();
  renderSummary();
  renderRecords();
}

function submitRecord() {
  const me = currentMember();
  if (!me) {
    showToast("团长还没有导入排表");
    return;
  }
  const isInvalid = els.claimType.value === "无效推车";
  if (!isInvalid && me.id === els.targetSelect.value) {
    showToast("不能把自己填成被推来的人");
    return;
  }
  state = addRecord({
    pusherId: me.id,
    targetId: isInvalid ? "" : els.targetSelect.value,
    claimType: els.claimType.value,
    proof: els.proofInput.value.trim(),
    proofImageName: selectedProofImage?.name || "",
    proofImageData: selectedProofImage?.dataUrl || "",
    status: isInvalid ? "无效推车" : "待确认",
    targetConfirmed: false,
  });
  els.proofInput.value = "";
  els.proofImage.value = "";
  els.proofImageName.textContent = "可上传群聊截图或社媒截图";
  selectedProofImage = null;
  render();
  showToast(isInvalid ? "已记录无效推车" : "已提交，等待被推人确认");
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  if (button.dataset.action === "confirm-target") {
    state = updateRecord(button.dataset.id, { targetConfirmed: true, status: "已确认" });
    showToast("已确认，计入有效状态");
  }
  if (button.dataset.action === "reject-target") {
    state = updateRecord(button.dataset.id, { targetConfirmed: false, status: "未通过" });
    showToast("已标记为未通过");
  }
  render();
});

els.meSelect.addEventListener("change", () => {
  currentMemberId = els.meSelect.value;
  localStorage.setItem("car-current-member", currentMemberId);
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
  if (file.size > 2 * 1024 * 1024) {
    els.proofImage.value = "";
    selectedProofImage = null;
    els.proofImageName.textContent = "可上传群聊截图或社媒截图";
    showToast("截图太大了，请上传 2MB 以内的图片");
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    selectedProofImage = {
      name: file.name,
      dataUrl: String(reader.result || ""),
    };
    els.proofImageName.textContent = `已选择：${file.name}`;
  });
  reader.addEventListener("error", () => showToast("截图读取失败，请重新上传"));
  reader.readAsDataURL(file);
});
els.addRecordBtn.addEventListener("click", submitRecord);

window.addEventListener("storage", () => {
  state = loadState();
  render();
});

render();
