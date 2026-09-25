/* 页面装配：状态、表单、筛选、按潜次分组的交接视图、导出 */
(function () {
  "use strict";

  const typeNames = { ceramic: "陶片", wood: "木构件", metal: "金属件", unknown: "未知物" };
  const TABS = {
    ready: { label: "待交接", empty: "暂无待交接记录：没有待复核交接单，也没有未登记的标记。" },
    pending: { label: "异常", empty: "异常清单为空：袋号冲突、资料空白或潜次不符的交接单会留在这里。" },
    stored: { label: "入库", empty: "暂无入库记录。" }
  };

  const mapEl = document.querySelector("#map");
  const recordsEl = document.querySelector("#records");
  const noticeEl = document.querySelector("#notice");
  const markForm = document.querySelector("#markForm");
  const handoverForm = document.querySelector("#handoverForm");
  const editorEl = document.querySelector("#editor");
  const editorCodeEl = document.querySelector("#editorCode");
  const photoInput = document.querySelector("#photoInput");
  const photoChips = document.querySelector("#photoChips");
  const diveFilter = document.querySelector("#diveFilter");
  const typeFilter = document.querySelector("#typeFilter");

  const state = {
    marks: [],
    handovers: [],
    tab: "ready",
    pendingPoint: null,
    formPhotos: [],
    editorMarkId: null
  };

  function persist() {
    Archive.saveMarks(state.marks);
    Archive.saveHandovers(state.handovers);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function notice(message, kind) {
    noticeEl.textContent = message;
    noticeEl.className = "notice " + (kind || "err");
  }
  function clearNotice() {
    noticeEl.textContent = "";
    noticeEl.className = "notice hidden";
  }

  const openFor = markId => state.handovers.find(h => h.markId === markId && (h.status === "ready" || h.status === "pending"));
  const storedFor = markId => state.handovers.filter(h => h.markId === markId && h.status === "stored");
  const markById = id => state.marks.find(m => m.id === id);

  // 地图圆点状态：未结束单优先显示其判定状态，否则显示已入库
  function statusOf(markId) {
    const open = openFor(markId);
    if (open) return open.status;
    return storedFor(markId).length ? "stored" : "";
  }

  function visibleMarks() {
    return state.marks.filter(m =>
      (!diveFilter.value || m.dive === diveFilter.value) &&
      (!typeFilter.value || m.type === typeFilter.value));
  }

  /* ---------------- 标记表单与照片 ---------------- */

  function renderPhotoChips() {
    photoChips.innerHTML = state.formPhotos.map((src, i) =>
      '<span class="chip"><img alt="补录照片" src="' + esc(src) + '">照片' + (i + 1) +
      '<button type="button" data-remove-photo="' + i + '">×</button></span>').join("");
  }

  function resetMarkForm() {
    markForm.reset();
    markForm.elements.id.value = "";
    state.pendingPoint = null;
    state.formPhotos = [];
    renderPhotoChips();
  }

  function editMark(id) {
    const mark = markById(id);
    if (!mark) return;
    markForm.elements.id.value = mark.id;
    ["code", "type", "dive", "depth", "orientation", "condition", "note"].forEach(key => {
      markForm.elements[key].value = mark[key] || "";
    });
    state.pendingPoint = { x: mark.x, y: mark.y };
    state.formPhotos = Array.isArray(mark.photos) ? mark.photos.slice() : [];
    renderPhotoChips();
    closeEditor();
    renderMap();
  }

  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const max = 480;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  photoInput.addEventListener("change", async () => {
    const files = Array.from(photoInput.files || []);
    photoInput.value = "";
    for (const file of files) {
      try {
        state.formPhotos.push(await shrinkImage(file));
      } catch (err) {
        notice("照片 " + file.name + " 读取失败。");
      }
    }
    renderPhotoChips();
  });

  photoChips.addEventListener("click", event => {
    const btn = event.target.closest("[data-remove-photo]");
    if (!btn) return;
    state.formPhotos.splice(Number(btn.dataset.removePhoto), 1);
    renderPhotoChips();
  });

  function photoSignature(photos) {
    return (photos || []).map(p => String(p).length).join(",");
  }

  markForm.addEventListener("submit", event => {
    event.preventDefault();
    const fd = new FormData(markForm);
    const id = markForm.elements.id.value;
    let mark = id ? markById(id) : null;

    if (!state.pendingPoint) state.pendingPoint = mark ? { x: mark.x, y: mark.y } : { x: 50, y: 50 };
    const payload = {
      code: String(fd.get("code") || "").trim(),
      type: fd.get("type"),
      dive: String(fd.get("dive") || "").trim(),
      depth: String(fd.get("depth") || "").trim(),
      orientation: String(fd.get("orientation") || "").trim(),
      condition: String(fd.get("condition") || "").trim(),
      note: String(fd.get("note") || "").trim(),
      photos: state.formPhotos.slice()
    };

    if (mark) {
      const reasons = [];
      if (payload.type !== mark.type) reasons.push("类型更正为「" + typeNames[payload.type] + "」");
      if (photoSignature(payload.photos) !== photoSignature(mark.photos)) reasons.push("补录或删改照片");
      if (payload.dive !== mark.dive) reasons.push("出水潜次更正为 " + payload.dive);

      Object.assign(mark, payload, state.pendingPoint);
      persist();

      if (reasons.length) {
        const reason = reasons.join("、");
        // 补录照片或更正类型后，旧交接失效并按新资料重判
        const rejudged = Judge.rejudgeAfterMarkChange(mark, state.handovers, state.marks, reason);
        persist();
        if (rejudged) {
          notice(reason + "：未结束交接单已失效并按新资料重新判定。", "");
        } else if (storedFor(mark.id).length) {
          notice(reason + "：该标记已有入库存档，历史交接记录保持不变。", "ok");
        } else {
          notice("标记已保存。", "ok");
        }
      } else {
        notice("标记已保存。", "ok");
      }
    } else {
      mark = Object.assign({ id: Archive.uid() }, payload, state.pendingPoint);
      state.marks.push(mark);
      persist();
      notice("标记 " + mark.code + " 已登记，可在右侧「待交接」中挂出水交接单。", "ok");
    }

    resetMarkForm();
    renderAll();
  });

  document.querySelector("#deleteBtn").addEventListener("click", () => {
    const id = markForm.elements.id.value;
    if (!id) return;
    if (state.handovers.some(h => h.markId === id)) {
      notice("该标记存在交接记录（含入库存档），不能删除；可在更正后让交接单重新判定。");
      return;
    }
    state.marks = state.marks.filter(m => m.id !== id);
    persist();
    resetMarkForm();
    clearNotice();
    renderAll();
  });

  mapEl.addEventListener("click", event => {
    if (event.target.closest(".marker")) return;
    state.pendingPoint = DiveMap.pointFromEvent(mapEl, event);
    markForm.reset();
    markForm.elements.id.value = "";
    const maxNo = state.marks.reduce((max, m) => {
      const hit = /^M-(\d+)$/.exec(m.code || "");
      return hit ? Math.max(max, Number(hit[1])) : max;
    }, 0);
    markForm.elements.code.value = "M-" + String(maxNo + 1).padStart(3, "0");
    markForm.elements.dive.value = diveFilter.value || "DIVE-01";
    state.formPhotos = [];
    renderPhotoChips();
    closeEditor();
    renderMap();
  });

  /* ---------------- 交接单编辑器 ---------------- */

  function openEditor(markId, handoverId) {
    const mark = markById(markId);
    if (!mark) return;
    const h = handoverId ? state.handovers.find(x => x.id === handoverId) : null;
    state.editorMarkId = markId;
    editorCodeEl.textContent = mark.code;
    handoverForm.elements.id.value = h ? h.id : "";
    handoverForm.elements.markId.value = markId;
    handoverForm.elements.dive.value = h ? h.dive : mark.dive;
    handoverForm.elements.bag.value = h ? h.bag : "";
    handoverForm.elements.preservation.value = h ? h.preservation : "";
    handoverForm.elements.receiver.value = h ? h.receiver : "";
    handoverForm.elements.registrar.value = h ? h.registrar : "";
    editorEl.classList.remove("hidden");
  }

  function closeEditor() {
    state.editorMarkId = null;
    handoverForm.reset();
    editorEl.classList.add("hidden");
  }
  document.querySelector("#editorCancel").addEventListener("click", closeEditor);

  handoverForm.addEventListener("submit", event => {
    event.preventDefault();
    const fd = new FormData(handoverForm);
    const result = Judge.submit({
      id: String(fd.get("id") || ""),
      markId: String(fd.get("markId") || ""),
      dive: fd.get("dive"),
      bag: fd.get("bag"),
      preservation: fd.get("preservation"),
      receiver: fd.get("receiver"),
      registrar: fd.get("registrar")
    }, state.marks, state.handovers);

    if (result.error) {
      notice(result.error);
      return;
    }
    persist();
    closeEditor();
    state.tab = result.handover.status;
    notice(result.handover.status === "ready"
      ? "判定通过：交接单进入待交接，等待与登记人不同的复核人入库。"
      : "存在异常，交接单留在待处理：" + result.handover.issues.join("；"),
      result.handover.status === "ready" ? "ok" : "err");
    renderAll();
  });

  /* ---------------- 列表操作（事件委托） ---------------- */

  recordsEl.addEventListener("click", event => {
    const registerBtn = event.target.closest("[data-register]");
    const editBtn = event.target.closest("[data-edit-handover]");
    const reviewBtn = event.target.closest("[data-review]");

    if (registerBtn) {
      openEditor(registerBtn.dataset.register, "");
      return;
    }
    if (editBtn) {
      const h = state.handovers.find(x => x.id === editBtn.dataset.editHandover);
      if (h) openEditor(h.markId, h.id);
      return;
    }
    if (reviewBtn) {
      const card = reviewBtn.closest(".card");
      const input = card.querySelector(".review-input");
      const result = Judge.reviewStore(reviewBtn.dataset.review, input.value, state.marks, state.handovers);
      if (result.error) {
        notice(result.error);
        return;
      }
      persist();
      state.tab = "stored";
      notice("复核通过，交接单已入库；复核人 " + result.handover.reviewer + " 与登记人不同。", "ok");
      renderAll();
    }
  });

  /* ---------------- 视图渲染 ---------------- */

  function renderMap() {
    DiveMap.render(mapEl, visibleMarks(), {
      selectedId: markForm.elements.id.value,
      statusOf,
      onSelect: editMark
    });
  }

  // 当前筛选下三个页签各自的记录
  function collectItems() {
    const visible = visibleMarks();
    const visibleIds = new Set(visible.map(m => m.id));
    const readyItems = [];
    const pendingItems = [];

    visible.forEach(mark => {
      const open = openFor(mark.id);
      if (open) {
        (open.status === "pending" ? pendingItems : readyItems).push({ mark, handover: open });
      } else if (!storedFor(mark.id).length) {
        readyItems.push({ mark, handover: null }); // 未登记交接单的标记
      }
    });

    const storedItems = state.handovers
      .filter(h => h.status === "stored" && visibleIds.has(h.markId))
      .map(h => ({ mark: markById(h.markId), handover: h }))
      .sort((a, b) => (a.handover.storedAt || "").localeCompare(b.handover.storedAt || ""));

    return { readyItems, pendingItems, storedItems };
  }

  function kv(rows) {
    return "<dl class='kv'>" + rows.map(([k, v]) =>
      "<dt>" + esc(k) + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl>";
  }

  function historyHtml(h) {
    if (!h.history || !h.history.length) return "";
    return "<div class='hist'>" + h.history.map(line =>
      "<div>" + esc((line.at || "").replace("T", " ")) + "　" + esc(line.text) + "</div>").join("") + "</div>";
  }

  function handoverCard(item) {
    const { mark, handover: h } = item;
    const status = h.status;
    const tagText = status === "stored" ? "已入库" : status === "ready" ? "待交接" : "待处理";
    let body =
      "<div class='head'><b>" + esc(mark.code) + "</b>" +
      "<span class='pill'>" + esc(typeNames[mark.type]) + "</span>" +
      "<span class='tag " + esc(status) + "'>" + tagText + "</span>" +
      "<span class='muted'>" + esc(h.bag) + "</span></div>";

    if (status === "pending" && h.issues.length) {
      body += "<ul class='issues'>" + h.issues.map(i => "<li>" + esc(i) + "</li>").join("") + "</ul>";
    }

    const rows = [
      ["出水潜次", mark.dive],
      ["登记潜次", h.dive],
      ["袋号", h.bag],
      ["保存措施", h.preservation],
      ["接手人", h.receiver],
      ["登记人", h.registrar]
    ];
    if (status === "stored") rows.push(["复核人", h.reviewer], ["入库时间", (h.storedAt || "").replace("T", " ")]);
    body += kv(rows);

    if (status === "ready") {
      body += "<div class='review'><input class='review-input' placeholder='复核人（须与登记人 " +
        esc(h.registrar) + " 不同）'><button type='button' class='mini' data-review='" +
        esc(h.id) + "'>复核入库</button></div>";
      body += "<button type='button' class='mini secondary' data-edit-handover='" + esc(h.id) + "'>更正登记</button>";
    } else if (status === "pending") {
      body += "<button type='button' class='mini' data-edit-handover='" + esc(h.id) + "'>补录后重新判定</button>";
    }
    body += historyHtml(h);
    return "<div class='card " + esc(status) + "'>" + body + "</div>";
  }

  function plainCard(mark) {
    const body =
      "<div class='head'><b>" + esc(mark.code) + "</b>" +
      "<span class='pill'>" + esc(typeNames[mark.type]) + "</span>" +
      "<span class='tag plain'>未登记交接</span>" +
      ((mark.photos && mark.photos.length) ? "<span class='muted'>照片" + mark.photos.length + "张</span>" : "") +
      "</div>" +
      kv([["出水潜次", mark.dive], ["深度", mark.depth], ["保存状态", mark.condition || "—"]]) +
      "<button type='button' class='mini' data-register='" + esc(mark.id) + "'>登记出水交接单</button>";
    return "<div class='card'>" + body + "</div>";
  }

  function groupByDive(items) {
    const groups = {};
    items.forEach(item => {
      const dive = item.mark && item.mark.dive ? item.mark.dive : "（潜次空白）";
      (groups[dive] ||= []).push(item);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function renderRecords(items) {
    const groups = groupByDive(items);
    if (!groups.length) {
      recordsEl.innerHTML = "<div class='empty muted'>" + TABS[state.tab].empty + "</div>";
      return;
    }
    recordsEl.innerHTML = groups.map(([dive, list]) =>
      "<div class='group'><h3>" + esc(dive) + "（" + list.length + "）</h3>" +
      list.map(item => item.handover ? handoverCard(item) : plainCard(item.mark)).join("") +
      "</div>").join("");
  }

  function renderCounts(collected) {
    document.querySelector("#count-ready").textContent = " " + collected.readyItems.length;
    document.querySelector("#count-pending").textContent = " " + collected.pendingItems.length;
    document.querySelector("#count-stored").textContent = " " + collected.storedItems.length;
    document.querySelectorAll(".tab").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === state.tab));
  }

  function renderDiveOptions() {
    const current = diveFilter.value;
    const dives = Array.from(new Set(state.marks.map(m => m.dive).filter(Boolean))).sort();
    diveFilter.innerHTML = "<option value=''>全部潜次</option>" +
      dives.map(d => "<option value='" + esc(d) + "'>" + esc(d) + "</option>").join("");
    diveFilter.value = dives.includes(current) ? current : "";
  }

  function renderAll() {
    renderDiveOptions();
    renderMap();
    const collected = collectItems();
    renderCounts(collected);
    renderRecords(collected[state.tab === "ready" ? "readyItems" : state.tab === "pending" ? "pendingItems" : "storedItems"]);
  }

  /* ---------------- 筛选与导出 ---------------- */

  diveFilter.addEventListener("change", renderAll);
  typeFilter.addEventListener("change", renderAll);
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      closeEditor();
      clearNotice();
      renderAll();
    });
  });

  function exportItems(items) {
    return items.map(item => {
      const { mark, handover: h } = item;
      const base = {
        markCode: mark.code,
        markType: typeNames[mark.type],
        dive: mark.dive,
        depth: mark.depth,
        photosCount: Array.isArray(mark.photos) ? mark.photos.length : 0
      };
      if (!h) return Object.assign(base, { handoverStatus: "未登记" });
      return Object.assign(base, {
        handoverStatus: Judge.TAB_LABELS[h.status] || h.status,
        registeredDive: h.dive,
        bag: h.bag,
        preservation: h.preservation,
        receiver: h.receiver,
        registrar: h.registrar,
        reviewer: h.reviewer || "",
        issues: h.issues,
        storedAt: h.storedAt || ""
      });
    });
  }

  document.querySelector("#exportBtn").addEventListener("click", () => {
    const collected = collectItems();
    const key = state.tab === "ready" ? "readyItems" : state.tab === "pending" ? "pendingItems" : "storedItems";
    Archive.exportRecords({
      exportedAt: new Date().toISOString(),
      view: TABS[state.tab].label,
      filter: { dive: diveFilter.value || "全部潜次", type: typeFilter.value ? typeNames[typeFilter.value] : "全部类型" },
      total: collected[key].length,
      records: exportItems(collected[key])
    }, TABS[state.tab].label);
  });

  /* ---------------- 启动 ---------------- */

  const loaded = Archive.load();
  state.marks = loaded.marks.map(m => Object.assign({ photos: [] }, m));
  state.handovers = loaded.handovers;
  renderAll();
})();
