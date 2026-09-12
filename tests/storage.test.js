import test from "node:test";
import assert from "node:assert/strict";
import { startApp, seedStorage } from "./helpers/dom.js";

const corruptCases = [
  ["非法 JSON", "{not json"],
  ["JSON null", "null"],
  ["JSON 数字", "42"],
  ["repairs 缺失", JSON.stringify({ filter: "all" })],
  ["repairs 为 null", JSON.stringify({ repairs: null })],
  ["列表项为 null", JSON.stringify({ repairs: [null] })],
  ["事项缺必填字段", JSON.stringify({ repairs: [{ id: "x" }] })],
  ["非法优先级枚举", JSON.stringify({ repairs: [{ id: "x", location: "a", title: "b", priority: "nope", cost: 1, status: "todo" }] })]
];

for (const [name, raw] of corruptCases) {
  test(`损坏数据回退空列表且页面可用：${name}`, async () => {
    const app = await startApp({ stored: raw });
    assert.deepEqual(app.state.repairs, []);
    assert.match(app.html(), /当前状态下没有维修事项/);

    // 坏数据已被空数据覆盖
    const saved = JSON.parse(app.persisted());
    assert.deepEqual(saved.repairs, []);
    assert.equal(saved.filter, "all");

    // 回退后仍可新增，应用完全可用
    app.submitNew({ title: "恢复后的新事项" });
    assert.equal(app.state.repairs[0].title, "恢复后的新事项");
  });
}

test("首次使用（无存储）展示示例数据", async () => {
  const app = await startApp();
  assert.equal(app.state.repairs.length, 1);
  assert.match(app.html(), /水槽下方渗水/);
});

test("完整数据刷新后原样保留", async () => {
  const stored = seedStorage();
  const app = await startApp({ stored });
  assert.equal(app.state.repairs.length, 4);
  assert.equal(app.state.repairs.find((r) => r.id === "C").completedAt, "2026-09-05T00:00:00.000Z");
  assert.deepEqual(app.titlesInOrder(), ["阳台门锁松动", "厨房水龙头更换", "卫生间地漏堵塞", "厨房水槽渗水"]);
});

test("老数据缺少 createdAt 时按数组顺序补齐，排序不崩且保持原顺序", async () => {
  const old = JSON.stringify({
    filter: "all",
    repairs: [
      { id: "2", location: "卧室", title: "第二条", priority: "low", cost: 10, status: "todo" },
      { id: "1", location: "客厅", title: "第一条", priority: "high", cost: 99, status: "doing" }
    ]
  });
  const app = await startApp({ stored: old });
  const [first, second] = app.state.repairs;
  assert.ok(!Number.isNaN(new Date(first.createdAt).getTime()));
  assert.ok(new Date(first.createdAt) > new Date(second.createdAt));
  assert.deepEqual(app.titlesInOrder(), ["第二条", "第一条"]);
});

test("可选字段缺失时自动补全而非丢弃记录", async () => {
  const partial = JSON.stringify({
    repairs: [{ id: "r9", location: "车库", title: "门响", priority: "high", status: "doing" }]
  });
  const app = await startApp({ stored: partial });
  assert.equal(app.state.repairs.length, 1);
  const repair = app.state.repairs[0];
  assert.equal(repair.cost, 0);
  assert.equal(repair.photo, "");
  assert.equal(repair.note, "");
  assert.match(app.html(), /暂无备注/);
});

test("编辑态不持久化，刷新后退出编辑态", async () => {
  const app = await startApp({ stored: seedStorage() });
  app.clickEdit("A");
  assert.equal(app.state.editingId, "A");
  const persisted = app.persisted();
  assert.equal(JSON.parse(persisted).editingId ?? null, null);

  const reloaded = await startApp({ stored: persisted });
  assert.equal(reloaded.state.editingId, null);
  assert.doesNotMatch(reloaded.html(), /edit-form/);
});

test("setItem 持续失败时：新增/状态切换/编辑/删除均不崩溃，当前页数据可用", async () => {
  const app = await startApp({ stored: seedStorage(), failWrites: true });
  const beforeRaw = app.persisted();
  const initialCount = app.state.repairs.length;

  // 新增生效
  app.submitNew({ title: "存储失败时的新事项", cost: "66" });
  const newId = app.state.repairs[0].id;
  assert.equal(app.state.repairs.length, initialCount + 1);
  assert.match(app.html(), /存储失败时的新事项/);
  assert.match(app.html(), /本地存储当前不可用/);

  // 状态切换记录完成时间
  app.setStatus(newId, "done");
  assert.equal(app.state.repairs[0].status, "done");
  assert.ok(app.state.repairs[0].completedAt);

  // 编辑生效
  app.clickEdit(newId);
  app.submitEdit(newId, { title: "存储失败时已编辑", cost: "77" });
  assert.equal(app.state.repairs[0].title, "存储失败时已编辑");

  // 筛选/排序仍可用
  app.setControl("sort", "costDesc");
  assert.equal(app.titlesInOrder()[0], "厨房水槽渗水");

  // 删除生效
  app.clickDelete(newId);
  assert.equal(app.state.repairs.length, initialCount);

  // 已有记录不受影响，存储自始至终未被写入
  assert.ok(app.state.repairs.some((r) => r.id === "A"));
  assert.equal(app.persisted(), beforeRaw);
});

test("存储恢复可写后，提示条消失且新改动正常持久化", async () => {
  // failWrites 只在单个实例内生效：先用失败实例操作，再模拟刷新到正常实例
  const failing = await startApp({ stored: seedStorage(), failWrites: true });
  failing.submitNew({ title: "仅存在于失败实例" });
  assert.match(failing.html(), /本地存储当前不可用/);
  const rawOnDisk = failing.persisted(); // 未写入，仍是种子数据

  const reloaded = await startApp({ stored: rawOnDisk });
  assert.doesNotMatch(reloaded.html(), /本地存储当前不可用/);
  reloaded.submitNew({ title: "恢复后新增" });
  assert.match(JSON.parse(reloaded.persisted()).repairs[0].title, /恢复后新增/);
});
