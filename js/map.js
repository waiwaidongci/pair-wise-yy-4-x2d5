/* 地图业务：沉船平面图标记渲染、船肋绘制与落点坐标 */
(function () {
  "use strict";

  function ensureRibs(mapEl) {
    if (mapEl.querySelector(".rib")) return;
    for (let i = 0; i < 7; i++) {
      const rib = document.createElement("div");
      rib.className = "rib";
      rib.style.left = 28 + i * 7 + "%";
      mapEl.appendChild(rib);
    }
  }

  // status: ready(待交接) / pending(待处理) / stored(入库) / ""(未登记)
  function render(mapEl, marks, options) {
    const opts = options || {};
    ensureRibs(mapEl);
    mapEl.querySelectorAll(".marker").forEach(el => el.remove());

    marks.forEach(mark => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "marker " + mark.type + (mark.id === opts.selectedId ? " selected" : "");
      el.style.left = mark.x + "%";
      el.style.top = mark.y + "%";
      el.textContent = (mark.code || "??").slice(0, 2);

      const dotClass = opts.statusOf ? opts.statusOf(mark.id) : "";
      const dot = document.createElement("span");
      dot.className = dotClass ? "dot " + dotClass : "dot";
      el.appendChild(dot);

      const photoCount = Array.isArray(mark.photos) ? mark.photos.length : 0;
      el.title = mark.code + (photoCount ? " · 照片" + photoCount + "张" : "");
      el.addEventListener("click", event => {
        event.stopPropagation();
        if (opts.onSelect) opts.onSelect(mark.id);
      });
      mapEl.appendChild(el);
    });
  }

  function pointFromEvent(mapEl, event) {
    const rect = mapEl.getBoundingClientRect();
    return {
      x: Number(((event.clientX - rect.left) / rect.width * 100).toFixed(2)),
      y: Number(((event.clientY - rect.top) / rect.height * 100).toFixed(2))
    };
  }

  window.DiveMap = { render, pointFromEvent };
})();
