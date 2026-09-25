/* 判定业务：交接单的提交判定、资料变更后重判、复核入库 */
(function () {
  "use strict";

  const REGISTER_FIELDS = ["dive", "bag", "preservation", "receiver", "registrar"];
  const FIELD_LABELS = {
    dive: "登记潜次",
    bag: "袋号",
    preservation: "保存措施",
    receiver: "接手人",
    registrar: "登记人"
  };
  const TAB_LABELS = { ready: "待交接", pending: "待处理", stored: "入库" };

  function trim(value) {
    return String(value == null ? "" : value).trim();
  }

  function now() {
    return new Date().toISOString().slice(0, 19);
  }

  // 核心判定：资料空白 / 同一袋号已占 / 潜次不符 -> 留待处理；否则待交接
  function evaluate(handover, marks, handovers) {
    const issues = [];
    const mark = marks.find(m => m.id === handover.markId);

    for (const key of REGISTER_FIELDS) {
      if (!trim(handover[key])) issues.push(FIELD_LABELS[key] + "空白");
    }
    if (!mark) {
      issues.push("关联标记缺失");
    } else if (trim(handover.dive) && trim(handover.dive) !== trim(mark.dive)) {
      issues.push("登记潜次 " + trim(handover.dive) + " 与标记出水潜次 " + trim(mark.dive) + " 不符");
    }

    const bag = trim(handover.bag);
    if (bag) {
      // 同一袋号先登记者占用；后挂的单留待处理（seq 为登记序号）
      const earlier = (a, b) =>
        (Number.isFinite(a.seq) && Number.isFinite(b.seq)) ? a.seq < b.seq
          : (a.createdAt || "") <= (b.createdAt || "");
      const owner = handovers.find(h =>
        h.id !== handover.id && h.status !== "void" && trim(h.bag) === bag &&
        earlier(h, handover));
      if (owner) issues.push("袋号 " + bag + " 已被其他交接单占用");
    }

    handover.issues = issues;
    handover.status = issues.length ? "pending" : "ready";
    return handover;
  }

  // 提交登记（每标记只允许一张未结束单）
  function submit(formData, marks, handovers) {
    let handover = handovers.find(h => h.id === formData.id);
    const isNew = !handover;
    if (isNew) {
      const exists = handovers.find(h => h.markId === formData.markId && h.status !== "void" && h.status !== "stored");
      if (exists) {
        return { error: "该标记已挂有未结束交接单 " + trim(exists.bag) + "，先处理或入库后才能再登记。" };
      }
      handover = {
        id: window.Archive.uid(),
        markId: formData.markId,
        seq: handovers.reduce((max, h) => Math.max(max, Number(h.seq) || 0), 0) + 1,
        history: [],
        reviewer: "",
        storedAt: "",
        createdAt: now()
      };
      handovers.push(handover);
    }

    for (const key of REGISTER_FIELDS) {
      handover[key] = trim(formData[key]);
    }
    handover.updatedAt = now();
    evaluate(handover, marks, handovers);
    // 袋号/资料变化会影响同袋号其他未结束单，连带重判
    handovers.forEach(other => {
      if (other.id !== handover.id && (other.status === "ready" || other.status === "pending")) {
        const before = other.status + "|" + other.issues.join(";");
        evaluate(other, marks, handovers);
        const after = other.status + "|" + other.issues.join(";");
        if (after !== before) {
          other.updatedAt = now();
          other.history.unshift({
            at: now(),
            text: "相关交接单 " + (trim(handover.bag) || "未编号") + " 资料变化，连带重判为" + TAB_LABELS[other.status]
          });
        }
      }
    });
    handover.history.unshift({
      at: now(),
      text: (isNew ? "登记提交" : "登记更正") + "，判定为" + TAB_LABELS[handover.status]
    });
    return { handover };
  }

  // 补录照片或更正类型后：旧交接失效，按新资料重判；潜次变更同样重算
  function rejudgeAfterMarkChange(mark, handovers, marks, reason) {
    const open = handovers.filter(h => h.markId === mark.id && (h.status === "ready" || h.status === "pending"));
    let touched = false;
    open.forEach(h => {
      const oldStatus = TAB_LABELS[h.status] || h.status;
      h.reviewer = "";
      h.updatedAt = now();
      evaluate(h, marks, handovers);
      h.history.unshift({
        at: now(),
        text: reason + "，原" + oldStatus + "交接单失效并按新资料重判为" + TAB_LABELS[h.status]
      });
      touched = true;
    });
    return touched;
  }

  // 复核入库：复核人不能同登记人；入库前按当前资料再校验一次
  function reviewStore(handoverId, reviewer, marks, handovers) {
    const handover = handovers.find(h => h.id === handoverId);
    if (!handover) return { error: "交接单不存在。" };
    const name = trim(reviewer);
    if (!name) return { error: "请填写复核人。" };
    if (name === trim(handover.registrar)) return { error: "复核人不能与登记人为同一人。" };

    evaluate(handover, marks, handovers);
    if (handover.status !== "ready") {
      return { error: "当前资料仍有异常，不能入库：" + handover.issues.join("；") };
    }

    handover.reviewer = name;
    handover.status = "stored";
    handover.storedAt = now();
    handover.updatedAt = handover.storedAt;
    handover.history.unshift({ at: handover.storedAt, text: "复核人 " + name + " 复核通过，入库" });
    return { handover };
  }

  window.Judge = {
    evaluate,
    submit,
    rejudgeAfterMarkChange,
    reviewStore,
    TAB_LABELS
  };
})();
