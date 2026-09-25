// 装配：状态、表单、列表与交接看板
const mapEl = document.querySelector("#map");
const form = document.querySelector("#form");
const list = document.querySelector("#list");
const filter = document.querySelector("#filter");
const viewSel = document.querySelector("#view");
const diveFilter = document.querySelector("#diveFilter");
const listTitle = document.querySelector("#listTitle");
const hoBox = document.querySelector("#handoverBox");

const typeNames = { ceramic: "陶片", wood: "木构件", metal: "金属件", unknown: "未知物" };
const statusNames = { open: "待交接", pending: "待处理", archived: "已入库", invalid: "已失效" };

let marks = Archive.loadMarks();
let handovers = Archive.loadHandovers();
let pendingCoord = null;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trim = s => String(s ?? "").trim();
const typeName = t => typeNames[t] || t || "未知";
const parsePhotos = s => trim(s) ? trim(s).split(/[,，;；]/).map(x => x.trim()).filter(Boolean) : [];

function persist() { Archive.saveAll(marks, handovers); }

function seed() {
  if (marks.length) return;
  const first = { id: crypto.randomUUID(), code: "A-017", type: "ceramic", dive: "DIVE-01", x: 42, y: 46, depth: "17.8m", orientation: "东", condition: "边缘残缺", note: "靠近船肋", photos: ["A017-1.jpg", "A017-2.jpg"] };
  const second = { id: crypto.randomUUID(), code: "W-003", type: "wood", dive: "DIVE-02", x: 58, y: 39, depth: "18.2m", orientation: "西北", condition: "稳定", note: "疑似横梁", photos: [] };
  marks = [first, second];
  handovers = [
    { id: crypto.randomUUID(), markId: first.id, dive: "DIVE-01", bagNo: "HD-01", preservation: "海水浸泡", receiver: "王磊", registrar: "陈潜", reviewer: "", status: "open", reasons: [], createdAt: "2026-09-25T08:10:00.000Z" },
    { id: crypto.randomUUID(), markId: second.id, dive: "DIVE-02", bagNo: "HD-01", preservation: "湿布包裹", receiver: "李岚", registrar: "陈潜", reviewer: "", status: "open", reasons: [], createdAt: "2026-09-25T08:25:00.000Z" }
  ];
}

seed();
Judge.rejudge(handovers, marks);
persist();

const filteredMarks = () => filter.value ? marks.filter(m => m.type === filter.value) : marks;
const currentMarkId = () => form.elements.markId.value;
const unfinishedOf = markId => handovers.find(h => h.markId === markId && Judge.isUnfinished(h));

function render() {
  MapView.render(filteredMarks(), currentMarkId());
  renderHandoverBox();
  diveFilter.hidden = viewSel.value !== "board";
  if (viewSel.value === "timeline") renderTimeline();
  else if (viewSel.value === "board") renderBoard();
  else renderList();
}

function renderList() {
  listTitle.textContent = "标记列表";
  list.className = "list";
  list.innerHTML = filteredMarks().map(m => {
    const ho = unfinishedOf(m.id);
    const pill = ho ? ' <span class="pill st-' + ho.status + '">' + statusNames[ho.status] + '</span>' : "";
    return '<div class="item ' + (m.id === currentMarkId() ? "active" : "") + '" data-id="' + m.id + '">' +
      '<b>' + esc(m.code) + '</b> <span class="pill">' + typeName(m.type) + '</span>' + pill +
      '<div class="muted">' + esc(m.dive) + ' · ' + esc(m.depth) + ' · ' + esc(m.orientation) + '</div>' +
      '<div>' + esc(m.condition) + '</div></div>';
  }).join("") || '<div class="muted">暂无记录</div>';
  list.querySelectorAll("[data-id]").forEach(el => el.onclick = () => editMark(el.dataset.id));
}

function renderTimeline() {
  listTitle.textContent = "潜次时间线";
  list.className = "timeline";
  const groups = filteredMarks().reduce((acc, item) => ((acc[item.dive] ||= []).push(item), acc), {});
  list.innerHTML = Object.entries(groups).map(([dive, items]) =>
    '<div class="item"><b>' + esc(dive) + '</b><div class="muted">新增' + items.length + '个标记</div>' +
    items.map(i => '<div>' + esc(i.code) + ' · ' + typeName(i.type) + '</div>').join("") + '</div>'
  ).join("") || '<div class="muted">暂无记录</div>';
}

// 交接看板：按潜次看待交接、异常待处理和已入库
function renderBoard() {
  listTitle.textContent = "交接看板";
  list.className = "list board";
  const dives = [...new Set([...marks.map(m => m.dive), ...handovers.map(h => h.dive)].filter(Boolean))].sort();
  const keep = diveFilter.value;
  diveFilter.innerHTML = '<option value="">全部潜次</option>' + dives.map(d => '<option value="' + esc(d) + '">' + esc(d) + '</option>').join("");
  if (dives.includes(keep)) diveFilter.value = keep;
  const dive = diveFilter.value;
  const rows = handovers.filter(h => !dive || h.dive === dive);
  const byDive = (a, b) => trim(a.dive).localeCompare(trim(b.dive)) || trim(a.createdAt).localeCompare(trim(b.createdAt));
  let html = "";
  for (const [status, label] of [["open", "待交接"], ["pending", "异常待处理"], ["archived", "已入库"]]) {
    const items = rows.filter(h => h.status === status).sort(byDive);
    html += '<div class="groupTitle">' + label + '（' + items.length + '）</div>';
    html += items.length ? items.map(hoCard).join("") : '<div class="muted">暂无</div>';
  }
  const dead = rows.filter(h => h.status === "invalid").length;
  if (dead) html += '<div class="muted">另有 ' + dead + ' 张已失效单，随导出存档。</div>';
  list.innerHTML = html;
}

function hoCard(h) {
  const mark = marks.find(m => m.id === h.markId);
  let html = '<div class="item"><b>袋号 ' + esc(h.bagNo || "—") + '</b> <span class="pill st-' + h.status + '">' + statusNames[h.status] + '</span>' +
    '<div class="muted">标记 ' + esc(mark ? mark.code : "（已删除）") + ' · 潜次 ' + esc(h.dive || "—") + '</div>' +
    '<div>保存措施：' + esc(h.preservation || "—") + '</div>' +
    '<div class="muted">接手人 ' + esc(h.receiver || "—") + ' · 登记人 ' + esc(h.registrar || "—") + '</div>';
  if (h.status === "pending" && h.reasons && h.reasons.length) {
    html += '<div class="reason">' + h.reasons.map(esc).join("；") + '</div>';
  }
  if (h.status === "open") {
    html += '<div class="cardRow"><input data-rev="' + h.id + '" placeholder="复核人（不能同登记人）"><button data-act="archive" data-id="' + h.id + '">入库</button></div>';
  }
  if (h.status === "pending" && mark) {
    html += '<div class="cardRow"><button class="secondary" data-act="edit" data-id="' + h.id + '">补正资料</button></div>';
  }
  if (h.status === "archived") {
    html += '<div class="muted">复核人 ' + esc(h.reviewer || "—") + (h.archivedAt ? ' · ' + esc(h.archivedAt.slice(0, 10)) : "") + '</div>';
  }
  return html + '</div>';
}

// 侧栏交接单：每个标记只挂一张未结束单，有则编辑，无则登记
function renderHandoverBox() {
  const mark = marks.find(m => m.id === currentMarkId());
  if (!mark) {
    hoBox.innerHTML = '<h2>出水交接</h2><div class="muted">在地图上选择标记后登记交接单；每个标记只挂一张未结束单。</div>';
    return;
  }
  const ho = unfinishedOf(mark.id);
  const archived = handovers.filter(h => h.markId === mark.id && h.status === "archived").length;
  const invalid = handovers.filter(h => h.markId === mark.id && h.status === "invalid").length;
  let head = '<h2>出水交接 · ' + esc(mark.code) + '</h2>';
  if (ho) {
    head += '<div><span class="pill st-' + ho.status + '">' + statusNames[ho.status] + '</span></div>';
    if (ho.reasons && ho.reasons.length) head += '<div class="reason">' + ho.reasons.map(esc).join("；") + '</div>';
  } else {
    head += '<div class="muted">当前无未结束交接单，可登记。</div>';
  }
  if (archived || invalid) head += '<div class="muted">已入库 ' + archived + ' 张 · 已失效 ' + invalid + ' 张</div>';
  const val = key => esc(ho ? ho[key] : (key === "dive" ? mark.dive : ""));
  hoBox.innerHTML = head +
    '<form id="hoForm"><input name="hoId" type="hidden" value="' + (ho ? ho.id : "") + '">' +
    '<label>潜次</label><input name="dive" value="' + val("dive") + '" placeholder="例如DIVE-04">' +
    '<label>袋号</label><input name="bagNo" value="' + val("bagNo") + '" placeholder="例如HD-07">' +
    '<label>保存措施</label><input name="preservation" value="' + val("preservation") + '" placeholder="例如海水浸泡、湿布包裹">' +
    '<label>接手人</label><input name="receiver" value="' + val("receiver") + '">' +
    '<label>登记人</label><input name="registrar" value="' + val("registrar") + '">' +
    '<div class="toolbar"><button>' + (ho ? "保存并重判" : "登记交接单") + '</button></div></form>';
  hoBox.querySelector("#hoForm").onsubmit = onHoSubmit;
}

function onHoSubmit(event) {
  event.preventDefault();
  const mark = marks.find(m => m.id === currentMarkId());
  if (!mark) return;
  const fd = new FormData(event.target);
  const data = {
    dive: trim(fd.get("dive")),
    bagNo: trim(fd.get("bagNo")),
    preservation: trim(fd.get("preservation")),
    receiver: trim(fd.get("receiver")),
    registrar: trim(fd.get("registrar"))
  };
  const hoId = fd.get("hoId");
  if (hoId) {
    const ho = handovers.find(h => h.id === hoId);
    if (!ho) return;
    Object.assign(ho, data);
  } else {
    if (unfinishedOf(mark.id)) { alert("该标记已有未结束交接单，请先处理。"); return; }
    handovers.push({ id: crypto.randomUUID(), markId: mark.id, ...data, reviewer: "", status: "open", reasons: [], createdAt: new Date().toISOString() });
  }
  Judge.rejudge(handovers, marks);
  persist();
  render();
}

function editMark(id) {
  const mark = marks.find(m => m.id === id);
  if (!mark) return;
  const el = form.elements;
  el.markId.value = mark.id;
  el.code.value = mark.code;
  el.type.value = mark.type;
  el.dive.value = mark.dive;
  el.depth.value = mark.depth;
  el.orientation.value = mark.orientation || "";
  el.condition.value = mark.condition || "";
  el.note.value = mark.note || "";
  el.photos.value = (mark.photos || []).join(", ");
  pendingCoord = { x: mark.x, y: mark.y };
  render();
}

function startNewMark(x, y) {
  pendingCoord = { x, y };
  form.reset();
  form.elements.markId.value = "";
  form.elements.code.value = "M-" + String(marks.length + 1).padStart(3, "0");
  form.elements.dive.value = "DIVE-01";
  render();
}

form.onsubmit = event => {
  event.preventDefault();
  const el = form.elements;
  const data = {
    code: trim(el.code.value),
    type: el.type.value,
    dive: trim(el.dive.value),
    depth: trim(el.depth.value),
    orientation: trim(el.orientation.value),
    condition: trim(el.condition.value),
    note: trim(el.note.value),
    photos: parsePhotos(el.photos.value)
  };
  const id = el.markId.value;
  if (id) {
    const mark = marks.find(m => m.id === id);
    if (!mark) return;
    const typeChanged = data.type !== mark.type;
    const photosAdded = data.photos.some(p => !(mark.photos || []).includes(p));
    Object.assign(mark, data, pendingCoord || {});
    // 补录照片或更正类型：旧交接失效，抄出新单按新资料重判
    if (typeChanged || photosAdded) {
      const reason = typeChanged ? "更正类型，按新资料重判" : "补录照片，按新资料重判";
      Judge.invalidateFor(id, handovers, reason).forEach(old => handovers.push(Judge.succeed(old)));
    }
  } else {
    const mark = { id: crypto.randomUUID(), ...data, ...(pendingCoord || { x: 50, y: 50 }) };
    marks.push(mark);
    el.markId.value = mark.id;
  }
  Judge.rejudge(handovers, marks);
  persist();
  render();
};

document.querySelector("#deleteBtn").onclick = () => {
  const id = currentMarkId();
  if (!id) return;
  Judge.invalidateFor(id, handovers, "标记已删除");
  marks = marks.filter(m => m.id !== id);
  form.reset();
  form.elements.markId.value = "";
  pendingCoord = null;
  Judge.rejudge(handovers, marks);
  persist();
  render();
};

// 看板操作：入库复核、补正资料
list.addEventListener("click", event => {
  const btn = event.target.closest("button[data-act]");
  if (!btn) return;
  const ho = handovers.find(h => h.id === btn.dataset.id);
  if (!ho) return;
  if (btn.dataset.act === "archive") {
    const input = list.querySelector('input[data-rev="' + ho.id + '"]');
    const err = Judge.archiveCheck(ho, input ? input.value : "");
    if (err) { alert(err); return; }
    ho.reviewer = trim(input.value);
    ho.status = "archived";
    ho.archivedAt = new Date().toISOString();
    Judge.rejudge(handovers, marks);
    persist();
    render();
  } else if (btn.dataset.act === "edit") {
    editMark(ho.markId);
  }
});

// 导出跟随当前筛选：类型筛标记，看板潜次筛交接单
document.querySelector("#exportBtn").onclick = () => {
  const type = filter.value;
  const dive = viewSel.value === "board" ? diveFilter.value : "";
  Archive.exportJSON({
    exportedAt: new Date().toISOString(),
    filter: { type: type ? typeName(type) : "全部类型", dive: dive || "全部潜次" },
    marks: type ? marks.filter(m => m.type === type) : marks,
    handovers: dive ? handovers.filter(h => h.dive === dive) : handovers
  });
};

MapView.init(mapEl, { onMark: editMark, onBlank: startNewMark });
filter.onchange = render;
viewSel.onchange = render;
diveFilter.onchange = render;
render();
