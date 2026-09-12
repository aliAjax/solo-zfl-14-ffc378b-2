import test from "node:test";
import assert from "node:assert/strict";
import { startApp, seedStorage } from "./helpers/dom.js";

// 种子数据：未完成 3 条（todo 2 / doing 1）、已完成 1 条
// 未完成预计费用 50 + 100 + 300 = 450；已完成支出 200；处理中 1
test("统计区展示未完成数、处理中数、未完成预计费用与已完成支出", async () => {
  const app = await startApp({ stored: seedStorage() });

  assert.equal(app.statValue("未完成"), "3");
  assert.equal(app.statValue("处理中"), "1");
  assert.equal(app.statValue("未完成预计费用"), "¥450");
  assert.equal(app.statValue("已完成支出"), "¥200");
});

test("统计始终基于全部记录，不受筛选/搜索/排序影响", async () => {
  const app = await startApp({ stored: seedStorage() });

  app.clickFilter("done");
  assert.equal(app.titlesInOrder().length, 1);
  assert.equal(app.statValue("已完成支出"), "¥200");
  assert.equal(app.statValue("未完成预计费用"), "¥450");

  app.clickFilter("all");
  app.setControl("keyword", "不存在的关键词");
  assert.equal(app.titlesInOrder().length, 0);
  assert.equal(app.statValue("未完成"), "3");

  app.setControl("keyword", "");
  app.setControl("locationFilter", "厨房");
  assert.equal(app.statValue("已完成支出"), "¥200");
});

test("费用为非法值时按 0 计入，不产生 NaN", async () => {
  const repairs = [
    { id: "1", location: "客厅", title: "a", priority: "high", cost: "abc", status: "todo", createdAt: "2026-09-01T00:00:00.000Z" },
    { id: "2", location: "卧室", title: "b", priority: "low", cost: 120, status: "done", createdAt: "2026-09-02T00:00:00.000Z" }
  ];
  const app = await startApp({ stored: seedStorage(repairs) });
  assert.equal(app.statValue("未完成预计费用"), "¥0");
  assert.equal(app.statValue("已完成支出"), "¥120");
});
