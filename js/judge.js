// 判定：交接单校验、重判、失效与入库复核规则
const Judge = (() => {
  // 登记必填项，空白即留待处理
  const REQUIRED = [["dive", "潜次"], ["bagNo", "袋号"], ["preservation", "保存措施"], ["receiver", "接手人"], ["registrar", "登记人"]];
  const isUnfinished = h => h.status === "open" || h.status === "pending";
  const text = v => String(v ?? "").trim();

  // 单张判定：occupiers 为当前已占用袋号的单（已入库 + 本轮先于它登记的未结束单）
  function judgeOne(handover, mark, occupiers, marks) {
    const reasons = [];
    const missing = REQUIRED.filter(([key]) => !text(handover[key])).map(([, label]) => label);
    if (missing.length) reasons.push("资料空白：" + missing.join("、"));
    if (!mark) reasons.push("标记不存在");
    else if (text(handover.dive) && text(handover.dive) !== text(mark.dive)) {
      reasons.push("潜次不符：登记" + text(handover.dive) + "，标记为" + text(mark.dive));
    }
    const bag = text(handover.bagNo);
    if (bag) {
      const clash = occupiers.find(o => o.id !== handover.id && text(o.bagNo) === bag);
      if (clash) {
        const owner = (marks.find(m => m.id === clash.markId) || {}).code || "另一单";
        reasons.push("袋号已占：" + bag + "（" + owner + "）");
      }
    }
    return { status: reasons.length ? "pending" : "open", reasons };
  }

  // 全量重判：只动未结束单，按登记先后排定袋号占用；已入库、已失效保持稳定
  function rejudge(handovers, marks) {
    const occupiers = handovers.filter(h => h.status === "archived");
    handovers.filter(isUnfinished)
      .sort((a, b) => text(a.createdAt).localeCompare(text(b.createdAt)))
      .forEach(h => {
        const mark = marks.find(m => m.id === h.markId);
        const result = judgeOne(h, mark, occupiers, marks);
        h.status = result.status;
        h.reasons = result.reasons;
        h.judgedAt = new Date().toISOString();
        occupiers.push(h);
      });
    return handovers;
  }

  // 资料变更（补录照片/更正类型/删除标记）时，让该标记的未结束单失效
  function invalidateFor(markId, handovers, reason) {
    const hit = handovers.filter(h => h.markId === markId && isUnfinished(h));
    hit.forEach(h => {
      h.status = "invalid";
      h.invalidReason = reason;
      h.closedAt = new Date().toISOString();
    });
    return hit;
  }

  // 旧单失效后按原资料抄出新单，交给 rejudge 按新资料重判；保留原登记时间，袋号占用顺序不变
  function succeed(old) {
    return {
      id: crypto.randomUUID(),
      markId: old.markId,
      dive: old.dive,
      bagNo: old.bagNo,
      preservation: old.preservation,
      receiver: old.receiver,
      registrar: old.registrar,
      reviewer: "",
      status: "open",
      reasons: [],
      supersedes: old.id,
      createdAt: old.createdAt || new Date().toISOString()
    };
  }

  // 入库复核：仅待交接单可入库，复核人不能同登记人
  function archiveCheck(handover, reviewer) {
    if (!handover || handover.status !== "open") return "只有待交接的单可以入库";
    if (!text(reviewer)) return "请填写复核人";
    if (text(reviewer) === text(handover.registrar)) return "复核人不能同登记人";
    return null;
  }

  return { isUnfinished, judgeOne, rejudge, invalidateFor, succeed, archiveCheck };
})();
