import test from "node:test";
import assert from "node:assert/strict";
import { startApp, seedStorage } from "./helpers/dom.js";

test("默认按创建时间倒序排列", async () => {
  const app = await startApp({ stored: seedStorage() });
  assert.deepEqual(app.titlesInOrder(), ["阳台门锁松动", "厨房水龙头更换", "卫生间地漏堵塞", "厨房水槽渗水"]);
});

test("按预计费用升序/降序排列，同额时创建时间新的在前", async () => {
  const app = await startApp({ stored: seedStorage() });

  app.setControl("sort", "costDesc");
  assert.deepEqual(app.titlesInOrder(), ["厨房水槽渗水", "厨房水龙头更换", "卫生间地漏堵塞", "阳台门锁松动"]);

  app.setControl("sort", "costAsc");
  assert.deepEqual(app.titlesInOrder(), ["阳台门锁松动", "卫生间地漏堵塞", "厨房水龙头更换", "厨房水槽渗水"]);
});

test("按优先级排列（高→中→低），同档按创建时间倒序", async () => {
  const app = await startApp({ stored: seedStorage() });
  app.setControl("sort", "priority");
  assert.deepEqual(app.titlesInOrder(), ["阳台门锁松动", "厨房水槽渗水", "卫生间地漏堵塞", "厨房水龙头更换"]);
});

test("按位置筛选", async () => {
  const app = await startApp({ stored: seedStorage() });
  app.setControl("locationFilter", "厨房");
  assert.deepEqual(app.titlesInOrder(), ["厨房水龙头更换", "厨房水槽渗水"]);
});

test("按优先级筛选", async () => {
  const app = await startApp({ stored: seedStorage() });
  app.setControl("priorityFilter", "high");
  assert.deepEqual(app.titlesInOrder(), ["阳台门锁松动", "厨房水槽渗水"]);
});

test("状态、位置、优先级筛选与关键词搜索可同时生效", async () => {
  const app = await startApp({ stored: seedStorage() });

  app.clickFilter("doing");
  app.setControl("locationFilter", "厨房");
  app.setControl("priorityFilter", "high");
  assert.deepEqual(app.titlesInOrder(), ["厨房水槽渗水"]);

  // 再叠加搜索（命中备注“紧急”）
  app.setControl("keyword", "紧急");
  assert.deepEqual(app.titlesInOrder(), ["厨房水槽渗水"]);

  // 关键词不匹配时为空
  app.setControl("keyword", "没有的内容");
  assert.deepEqual(app.titlesInOrder(), []);
  assert.match(app.html(), /没有符合筛选条件的维修事项/);
});

test("关键词可命中位置、问题描述和备注，且不区分大小写", async () => {
  const app = await startApp({ stored: seedStorage() });

  app.setControl("keyword", "门锁");
  assert.deepEqual(app.titlesInOrder(), ["阳台门锁松动"]); // 命中备注与标题

  app.setControl("keyword", "厨房");
  assert.deepEqual(app.titlesInOrder(), ["厨房水龙头更换", "厨房水槽渗水"]); // 命中位置

  app.setControl("keyword", "WATER"); // 大写搜索：种子无英文，应为空
  assert.deepEqual(app.titlesInOrder(), []);
});

test("筛选条件变更会持久化，刷新后结果一致", async () => {
  const app = await startApp({ stored: seedStorage() });
  app.clickFilter("doing");
  app.setControl("locationFilter", "厨房");
  app.setControl("priorityFilter", "high");
  app.setControl("sort", "costDesc");
  app.setControl("keyword", "水");

  const persisted = app.persisted();

  // 全新实例“刷新”后读取同一份存储，渲染结果与控件状态一致
  const reloaded = await startApp({ stored: persisted });
  assert.deepEqual(reloaded.titlesInOrder(), ["厨房水槽渗水"]);
  assert.equal(reloaded.state.filter, "doing");
  assert.equal(reloaded.state.locationFilter, "厨房");
  assert.equal(reloaded.state.priorityFilter, "high");
  assert.equal(reloaded.state.sort, "costDesc");
  assert.equal(reloaded.state.keyword, "水");
  assert.match(reloaded.html(), /value="水"/);
  assert.match(reloaded.html(), /共 1 条匹配事项/);
});

test("删除某位置的最后一条记录后，刷新时失效的位置筛选回退为全部", async () => {
  const app = await startApp({
    stored: seedStorage(
      [{ id: "1", location: "客厅", title: "灯", priority: "high", cost: 10, status: "todo", createdAt: "2026-09-01T00:00:00.000Z" }],
      { locationFilter: "阁楼" }
    )
  });
  assert.equal(app.state.locationFilter, "all");
  assert.deepEqual(app.titlesInOrder(), ["灯"]);
});
