// 地图：沉船平面图与标记渲染
const MapView = (() => {
  let mapEl = null;
  let onMark = () => {};
  let onBlank = () => {};

  function init(el, handlers) {
    mapEl = el;
    onMark = handlers.onMark || onMark;
    onBlank = handlers.onBlank || onBlank;
    const wreck = document.createElement("div");
    wreck.className = "wreck";
    mapEl.appendChild(wreck);
    for (let i = 0; i < 7; i++) {
      const rib = document.createElement("div");
      rib.className = "rib";
      rib.style.left = 28 + i * 7 + "%";
      mapEl.appendChild(rib);
    }
    mapEl.addEventListener("click", event => {
      const rect = mapEl.getBoundingClientRect();
      onBlank(
        Number(((event.clientX - rect.left) / rect.width * 100).toFixed(2)),
        Number(((event.clientY - rect.top) / rect.height * 100).toFixed(2))
      );
    });
  }

  function render(marks, selectedId) {
    mapEl.querySelectorAll(".marker").forEach(el => el.remove());
    marks.forEach(mark => {
      const el = document.createElement("button");
      el.className = "marker " + mark.type + (mark.id === selectedId ? " selected" : "");
      el.style.left = mark.x + "%";
      el.style.top = mark.y + "%";
      el.textContent = String(mark.code || "").slice(0, 2);
      el.title = mark.code || "";
      el.onclick = event => { event.stopPropagation(); onMark(mark.id); };
      mapEl.appendChild(el);
    });
  }

  return { init, render };
})();
