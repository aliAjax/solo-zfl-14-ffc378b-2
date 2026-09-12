// 最小浏览器环境桩：把真实的 src/main.js 放进假 DOM/localStorage 中运行，
// 事件绑定与渲染流程与生产代码完全一致（main.js 直接操作 document）。
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SOURCE_URL = new URL("../../src/main.js", import.meta.url);
const STORAGE_KEY = "zfl-14-repairs";

const formPayloads = new Map();
let moduleCounter = 0;

function makeElement(tagName = "div") {
  const listeners = {};
  return {
    tagName: tagName.toUpperCase(),
    dataset: {},
    value: "",
    focus() {},
    setSelectionRange() {},
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    dispatchEvent(type, event = {}) {
      const handler = listeners[type];
      if (handler) handler({ preventDefault() {}, target: this, ...event });
    }
  };
}

function decodeAttr(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function buildStubs(html) {
  const byAttr = (regex, key) => {
    const nodes = [];
    for (const match of html.matchAll(regex)) {
      const node = makeElement();
      node.dataset[key] = match[1];
      nodes.push(node);
    }
    return nodes;
  };

  const controls = [];
  for (const match of html.matchAll(/data-control="([^"]+)"/g)) {
    const node = makeElement();
    node.dataset.control = match[1];
    const valueMatch = html.match(new RegExp(`data-control="${match[1]}"[\\s\\S]{0,400}?value="([^"]*)"`));
    node.value = valueMatch ? decodeAttr(valueMatch[1]) : "";
    controls.push(node);
  }

  const editForms = [];
  const editMatch = html.match(/data-edit-form="([^"]+)"/);
  if (editMatch) {
    const form = makeElement("form");
    form.dataset.editForm = editMatch[1];
    editForms.push(form);
  }

  return {
    form: makeElement("form"),
    "[data-filter]": byAttr(/data-filter="([^"]+)"/g, "filter"),
    "[data-status]": byAttr(/data-status="([^"]+)"/g, "status"),
    "[data-edit]": byAttr(/data-edit="([^"]+)"/g, "edit"),
    "[data-edit-form]": editForms,
    "[data-cancel]": byAttr(/data-cancel="([^"]+)"/g, "cancel"),
    "[data-delete]": byAttr(/data-delete="([^"]+)"/g, "delete"),
    "[data-control]": controls,
    controls
  };
}

// 启动一份全新的应用实例。stored 为 undefined 表示首次使用（无本地数据）。
export async function startApp({ stored, failWrites = false, failReads = false } = {}) {
  const store = new Map();
  if (stored !== undefined) store.set(STORAGE_KEY, stored);

  globalThis.localStorage = {
    getItem(key) {
      if (failReads) throw new Error("localStorage.getItem blocked");
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (failWrites) throw new Error("QuotaExceededError: localStorage.setItem blocked");
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    }
  };

  let stubs = buildStubs("");
  let renderedHtml = "";
  const app = makeElement("main");
  Object.defineProperty(app, "innerHTML", {
    configurable: true,
    get: () => renderedHtml,
    set: (value) => {
      renderedHtml = value;
      stubs = buildStubs(value);
    }
  });

  globalThis.document = {
    querySelector(selector) {
      if (selector === "#app") return app;
      if (selector === "#repair-form") return stubs.form;
      if (selector === '[data-control="keyword"]') {
        return stubs.controls.find((node) => node.dataset.control === "keyword") || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      return stubs[selector] || [];
    }
  };

  globalThis.FormData = class FormDataStub {
    constructor(form) {
      this.entries = formPayloads.get(form) || [];
    }
    [Symbol.iterator]() {
      return this.entries[Symbol.iterator]();
    }
  };

  // 去掉 CSS import（Node 无法加载样式），导出内部 state 供断言；每个实例用独立临时文件绕过模块缓存。
  const code =
    readFileSync(SOURCE_URL, "utf8").replace(/^import\s+["'][^"']*styles\.css["'];?\s*$/m, "") +
    "\nexport { state };\n";
  const tmpFile = join(tmpdir(), `repair-app-${process.pid}-${moduleCounter++}.mjs`);
  writeFileSync(tmpFile, code);
  const moduleUrl = pathToFileURL(tmpFile).href;
  const appModule = await import(moduleUrl);
  rmSync(tmpFile, { force: true });

  const find = (list, predicate) => {
    const node = list.find(predicate);
    if (!node) throw new Error(`未找到控件: ${predicate.toString()}\n${renderedHtml.slice(0, 400)}`);
    return node;
  };

  const api = {
    get state() {
      return appModule.state;
    },
    html: () => renderedHtml,
    persisted: () => store.get(STORAGE_KEY) ?? null,

    submitNew(fields = {}) {
      const data = {
        location: "卫生间",
        title: "测试维修事项",
        priority: "medium",
        cost: "0",
        status: "todo",
        photo: "",
        note: "",
        ...fields
      };
      formPayloads.set(stubs.form, Object.entries(data));
      stubs.form.dispatchEvent("submit");
    },

    submitEdit(id, fields = {}) {
      const form = find(stubs["[data-edit-form]"], (node) => node.dataset.editForm === id);
      const current = appModule.state.repairs.find((repair) => repair.id === id);
      const data = {
        location: current.location,
        title: current.title,
        priority: current.priority,
        cost: String(current.cost),
        status: current.status,
        photo: current.photo,
        note: current.note,
        ...fields
      };
      formPayloads.set(form, Object.entries(data));
      form.dispatchEvent("submit");
    },

    setStatus(id, value) {
      const node = find(stubs["[data-status]"], (item) => item.dataset.status === id);
      node.value = value;
      node.dispatchEvent("change");
    },

    setControl(key, value) {
      const node = find(stubs.controls, (item) => item.dataset.control === key);
      node.value = value;
      node.dispatchEvent(key === "keyword" ? "input" : "change");
    },

    clickFilter(value) {
      find(stubs["[data-filter]"], (node) => node.dataset.filter === value).dispatchEvent("click");
    },
    clickEdit(id) {
      find(stubs["[data-edit]"], (node) => node.dataset.edit === id).dispatchEvent("click");
    },
    clickCancel(id) {
      find(stubs["[data-cancel]"], (node) => node.dataset.cancel === id).dispatchEvent("click");
    },
    clickDelete(id) {
      find(stubs["[data-delete]"], (node) => node.dataset.delete === id).dispatchEvent("click");
    },

    titlesInOrder() {
      return [...renderedHtml.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((match) => decodeAttr(match[1]));
    },
    statValue(label) {
      const match = renderedHtml.match(new RegExp(`<span>${label}</span><strong>([^<]+)</strong>`));
      return match ? match[1] : null;
    }
  };

  return api;
}

// 固定测试数据集（不同位置/优先级/费用/状态/创建时间）
export function seedRepairs() {
  return [
    { id: "D", location: "阳台", title: "阳台门锁松动", priority: "high", cost: 50, status: "todo", photo: "", note: "门锁", completedAt: null, createdAt: "2026-09-04T00:00:00.000Z" },
    { id: "C", location: "厨房", title: "厨房水龙头更换", priority: "low", cost: 200, status: "done", photo: "", note: "已换", completedAt: "2026-09-05T00:00:00.000Z", createdAt: "2026-09-03T00:00:00.000Z" },
    { id: "B", location: "卫生间", title: "卫生间地漏堵塞", priority: "medium", cost: 100, status: "todo", photo: "", note: "", completedAt: null, createdAt: "2026-09-02T00:00:00.000Z" },
    { id: "A", location: "厨房", title: "厨房水槽渗水", priority: "high", cost: 300, status: "doing", photo: "", note: "紧急", completedAt: null, createdAt: "2026-09-01T00:00:00.000Z" }
  ];
}

export function seedStorage(repairs = seedRepairs(), view = {}) {
  return JSON.stringify({
    filter: "all",
    locationFilter: "all",
    priorityFilter: "all",
    sort: "created",
    keyword: "",
    ...view,
    repairs
  });
}
