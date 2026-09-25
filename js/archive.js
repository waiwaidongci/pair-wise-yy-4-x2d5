// 存档：本地持久化与导出
const Archive = (() => {
  const MARKS_KEY = "zfl30Marks";
  const HANDOVERS_KEY = "zfl30Handovers";

  const read = key => {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  return {
    loadMarks: () => read(MARKS_KEY),
    loadHandovers: () => read(HANDOVERS_KEY),
    saveAll(marks, handovers) {
      write(MARKS_KEY, marks);
      write(HANDOVERS_KEY, handovers);
    },
    exportJSON(payload, filename = "dive-records.json") {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };
})();
