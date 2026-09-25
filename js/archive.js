/* 存档业务：本地持久化、演示种子、记录导出 */
(function () {
  "use strict";

  const MARK_KEY = "zfl30Marks";
  const HANDOVER_KEY = "zfl30Handovers";
  const SEED_FLAG = "zfl30SeededV2";

  function read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch (err) {
      return [];
    }
  }

  function uid() {
    return typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function seedData() {
    const existing = read(MARK_KEY);
    if (localStorage.getItem(SEED_FLAG)) return { marks: existing, handovers: read(HANDOVER_KEY) };
    localStorage.setItem(SEED_FLAG, "1");

    let marks = existing;
    if (!marks.length) {
      marks = [
        { id: uid(), code: "A-017", type: "ceramic", dive: "DIVE-01", x: 42, y: 46, depth: "17.8m", orientation: "东", condition: "边缘残缺", note: "靠近船肋", photos: [] },
        { id: uid(), code: "W-003", type: "wood", dive: "DIVE-02", x: 58, y: 39, depth: "18.2m", orientation: "西北", condition: "稳定", note: "疑似横梁", photos: [] },
        { id: uid(), code: "M-009", type: "metal", dive: "DIVE-02", x: 35, y: 61, depth: "19.0m", orientation: "南", condition: "硬结壳覆盖", note: "", photos: [] },
        { id: uid(), code: "C-022", type: "unknown", dive: "DIVE-03", x: 66, y: 58, depth: "18.6m", orientation: "西", condition: "待辨识", note: "", photos: [] }
      ];
    }
    marks.forEach(m => { if (!Array.isArray(m.photos)) m.photos = []; });

    // 旧版演示数据补交接种子；用户若已删除对应标记则跳过
    const byCode = Object.fromEntries(marks.map(m => [m.code, m.id]));
    const handovers = [];
    let seq = 0;
    const pushIf = (code, h) => {
      const markId = byCode[code];
      if (markId) handovers.push(Object.assign({ id: uid(), seq: ++seq, markId, history: [] }, h));
    };
    pushIf("A-017", {
      dive: "DIVE-01", bag: "BAG-101", preservation: "淡水脱盐浸泡", receiver: "林舟",
      registrar: "赵潜", reviewer: "", status: "ready",
      createdAt: "2026-09-23T09:12:00", updatedAt: "2026-09-23T09:12:00",
      storedAt: "", issues: []
    });
    pushIf("W-003", {
      dive: "DIVE-02", bag: "BAG-101", preservation: "避光保湿", receiver: "何岩",
      registrar: "赵潜", reviewer: "", status: "pending",
      createdAt: "2026-09-23T10:05:00", updatedAt: "2026-09-23T10:05:00",
      storedAt: "", issues: ["袋号 BAG-101 已被其他交接单占用"]
    });
    pushIf("M-009", {
      dive: "DIVE-01", bag: "BAG-102", preservation: "", receiver: "何岩",
      registrar: "孙潮", reviewer: "", status: "pending",
      createdAt: "2026-09-23T10:40:00", updatedAt: "2026-09-23T10:40:00",
      storedAt: "", issues: ["保存措施空白", "登记潜次 DIVE-01 与标记出水潜次 DIVE-02 不符"]
    });
    pushIf("C-022", {
      dive: "DIVE-03", bag: "BAG-088", preservation: "海绵包裹保湿", receiver: "林舟",
      registrar: "孙潮", reviewer: "何岩", status: "stored",
      createdAt: "2026-09-22T15:20:00", updatedAt: "2026-09-22T16:02:00",
      storedAt: "2026-09-22T16:02:00", issues: []
    });

    localStorage.setItem(MARK_KEY, JSON.stringify(marks));
    localStorage.setItem(HANDOVER_KEY, JSON.stringify(handovers));
    return { marks, handovers };
  }

  const Archive = {
    uid,
    load() {
      return seedData();
    },
    saveMarks(marks) {
      localStorage.setItem(MARK_KEY, JSON.stringify(marks));
    },
    saveHandovers(handovers) {
      localStorage.setItem(HANDOVER_KEY, JSON.stringify(handovers));
    },
    // 导出当前视图记录（导出内容跟随筛选与页签）
    exportRecords(payload, tabName) {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "出水交接-" + tabName + "-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  window.Archive = Archive;
})();
