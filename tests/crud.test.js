import test from "node:test";
import assert from "node:assert/strict";
import { startApp } from "./helpers/dom.js";

test("首次使用展示示例数据，新增事项置顶并持久化", async () => {
  const app = await startApp();
  assert.equal(app.state.repairs.length, 1);
  assert.match(app.html(), /水槽下方渗水/);

  app.submitNew({
    location: "阳台",
    title: "晾衣架损坏",
    priority: "low",
    cost: "88",
    note: "周末处理"
  });

  assert.equal(app.state.repairs.length, 2);
  assert.equal(app.state.repairs[0].title, "晾衣架损坏");
  assert.equal(app.state.repairs[0].cost, 88);
  assert.equal(app.state.repairs[0].status, "todo");
  assert.equal(app.state.repairs[0].completedAt, null);
  assert.ok(new Date(app.state.repairs[0].createdAt).getTime() <= Date.now());
  assert.match(app.html(), /晾衣架损坏/);

  const saved = JSON.parse(app.persisted());
  assert.equal(saved.repairs.length, 2);
  assert.equal(saved.repairs[0].title, "晾衣架损坏");
});

test("新增时直接选择已完成，会记录完成时间", async () => {
  const app = await startApp();
  app.submitNew({ title: "已处理的小事", status: "done", cost: "30" });
  const repair = app.state.repairs[0];
  assert.equal(repair.status, "done");
  assert.equal(typeof repair.completedAt, "string");
  assert.match(app.html(), /完成于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
});

test("状态切换到已完成记录完成时间，重复保持不变，改回未完成清空", async () => {
  const app = await startApp();
  const id = app.state.repairs[0].id;

  app.setStatus(id, "doing");
  assert.equal(app.state.repairs[0].status, "doing");
  assert.equal(app.state.repairs[0].completedAt, null);

  app.setStatus(id, "done");
  const firstDoneAt = app.state.repairs[0].completedAt;
  assert.ok(firstDoneAt);
  assert.match(app.html(), /完成于 /);

  // 再次保存为已完成（编辑保存）不覆盖原完成时间
  app.clickEdit(id);
  app.submitEdit(id, { status: "done", title: "水槽下方渗水-更新" });
  assert.equal(app.state.repairs[0].completedAt, firstDoneAt);
  assert.equal(app.state.repairs[0].title, "水槽下方渗水-更新");

  app.setStatus(id, "todo");
  assert.equal(app.state.repairs[0].completedAt, null);
  assert.doesNotMatch(app.html(), /完成于 /);
});

test("点开事项进入编辑态，可修改全部字段，保存只更新当前记录", async () => {
  const app = await startApp();
  const id = app.state.repairs[0].id;

  app.clickEdit(id);
  assert.equal(app.state.editingId, id);
  assert.match(app.html(), /edit-form/);
  assert.match(app.html(), /保存修改/);

  app.submitEdit(id, {
    location: "厨房2",
    title: "重新打胶",
    priority: "low",
    cost: "150",
    status: "done",
    photo: "http://example.com/a.jpg",
    note: "已验收"
  });

  assert.equal(app.state.editingId, null);
  const repair = app.state.repairs.find((item) => item.id === id);
  assert.deepEqual(
    { location: repair.location, title: repair.title, priority: repair.priority, cost: repair.cost, status: repair.status, photo: repair.photo, note: repair.note },
    { location: "厨房2", title: "重新打胶", priority: "low", cost: 150, status: "done", photo: "http://example.com/a.jpg", note: "已验收" }
  );
  assert.ok(repair.completedAt);
});

test("取消编辑放弃修改并退出编辑态", async () => {
  const app = await startApp();
  const id = app.state.repairs[0].id;
  const before = { ...app.state.repairs[0] };

  app.clickEdit(id);
  app.clickCancel(id);

  assert.equal(app.state.editingId, null);
  assert.doesNotMatch(app.html(), /edit-form/);
  assert.deepEqual(app.state.repairs[0], before);
});

test("删除事项后列表与本地存储同步移除", async () => {
  const app = await startApp();
  const id = app.state.repairs[0].id;

  app.clickDelete(id);
  assert.equal(app.state.repairs.length, 0);
  assert.equal(JSON.parse(app.persisted()).repairs.length, 0);
  assert.match(app.html(), /当前状态下没有维修事项/);
});
