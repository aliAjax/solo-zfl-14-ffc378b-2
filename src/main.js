import "./styles.css";

const STORAGE_KEY = "zfl-14-repairs";
const statuses = {
  all: "全部",
  todo: "待处理",
  doing: "处理中",
  done: "已完成"
};

const priorities = {
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级"
};

let state = loadState();
let storageWritable = true;
const app = document.querySelector("#app");

function defaultState() {
  return {
    filter: "all",
    editingId: null,
    repairs: [
      {
        id: crypto.randomUUID(),
        location: "厨房",
        title: "水槽下方渗水",
        priority: "high",
        cost: 260,
        status: "todo",
        photo: "",
        note: "先检查软管接口",
        completedAt: null
      }
    ]
  };
}

// 数据损坏时的安全回退：空列表，不编造任何维修记录
function emptyState() {
  return { filter: "all", editingId: null, repairs: [] };
}

function loadState() {
  let saved;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    return defaultState();
  }
  if (!saved) return defaultState();

  let parsed;
  try {
    parsed = JSON.parse(saved);
  } catch {
    return recover();
  }

  // 顶层结构损坏（非对象、repairs 缺失或不是数组）：回退空数据
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.repairs)) {
    return recover();
  }

  let repairs;
  try {
    repairs = parsed.repairs.map(normalizeRepair);
  } catch {
    return recover();
  }
  // 任一事项字段缺失或非法，整份数据视为不可用
  if (repairs.some((repair) => !repair)) return recover();

  const filter = typeof parsed.filter === "string" && parsed.filter in statuses ? parsed.filter : "all";
  return { filter, editingId: null, repairs };
}

// 坏数据无法修复：回退空数据并立刻写回，避免下次刷新继续读到坏数据
function recover() {
  const fallback = emptyState();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
  } catch {
    // localStorage 不可用时仅在本次会话内存中回退
  }
  return fallback;
}

function normalizeRepair(raw) {
  if (!raw || typeof raw !== "object") throw new Error("invalid repair");

  const { id, location, title, priority, cost, status, photo, note, completedAt } = raw;
  if (typeof location !== "string" || !location.trim()) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  if (!(priority in priorities)) return null;
  if (!(status in statuses) || status === "all") return null;

  const doneAt = status === "done" && typeof completedAt === "string" && !Number.isNaN(new Date(completedAt).getTime()) ? completedAt : null;
  return {
    id: typeof id === "string" && id ? id : crypto.randomUUID(),
    location,
    title,
    priority,
    cost: Number(cost) || 0,
    status,
    photo: typeof photo === "string" ? photo : "",
    note: typeof note === "string" ? note : "",
    completedAt: doneAt
  };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageWritable = true;
  } catch {
    // 存储不可用（配额超限/隐私模式）：保留内存中的当前页数据，不阻断页面
    storageWritable = false;
  }
}

// 统一处理状态切换：切到已完成时记录完成时间，离开已完成时清空
function applyStatus(repair, nextStatus) {
  if (nextStatus === "done" && repair.status !== "done") {
    repair.completedAt = new Date().toISOString();
  } else if (nextStatus !== "done") {
    repair.completedAt = null;
  }
  repair.status = nextStatus;
}

function render() {
  const repairs = filteredRepairs();
  const unfinished = state.repairs.filter((repair) => repair.status !== "done");
  const finished = state.repairs.filter((repair) => repair.status === "done");
  const totalCost = unfinished.reduce((total, repair) => total + (Number(repair.cost) || 0), 0);
  const spentCost = finished.reduce((total, repair) => total + (Number(repair.cost) || 0), 0);
  const doing = state.repairs.filter((repair) => repair.status === "doing").length;

  app.innerHTML = `
    <main class="shell">
      ${storageWritable ? "" : `<div class="storage-warning" role="alert">本地存储当前不可用，本次改动在刷新后可能丢失；页面功能仍可正常使用。</div>`}
      <header class="header">
        <div>
          <p class="eyebrow">本地家庭维护台</p>
          <h1>家庭维修事项</h1>
        </div>
        <section class="stats">
          <div class="stat"><span>未完成</span><strong>${unfinished.length}</strong></div>
          <div class="stat"><span>处理中</span><strong>${doing}</strong></div>
          <div class="stat"><span>未完成预计费用</span><strong>¥${totalCost}</strong></div>
          <div class="stat"><span>已完成支出</span><strong>¥${spentCost}</strong></div>
        </section>
      </header>

      <section class="layout">
        <aside class="panel">
          <h2>新增维修事项</h2>
          <form class="form" id="repair-form">
            <label>位置<input name="location" required placeholder="例如卫生间"></label>
            <label>问题描述<textarea name="title" required placeholder="例如门锁松动"></textarea></label>
            <label>优先级<select name="priority">${renderPriorityOptions("medium")}</select></label>
            <label>预计费用<input name="cost" type="number" min="0" step="1" value="0"></label>
            <label>处理状态<select name="status">${renderStatusOptions("todo")}</select></label>
            <label>照片链接<input name="photo" type="url" placeholder="可选，粘贴图片地址"></label>
            <label>备注<textarea name="note" placeholder="师傅电话、材料或注意事项"></textarea></label>
            <button class="primary" type="submit">保存事项</button>
          </form>
        </aside>

        <section>
          <div class="toolbar">
            ${Object.entries(statuses).map(([value, label]) => `<button class="seg ${state.filter === value ? "active" : ""}" data-filter="${value}">${label}</button>`).join("")}
          </div>
          <div class="repairs">
            ${repairs.length ? repairs.map(renderRepair).join("") : `<div class="empty">当前状态下没有维修事项</div>`}
          </div>
        </section>
      </section>
    </main>
  `;

  bindEvents();
}

function renderRepair(repair) {
  if (state.editingId === repair.id) return renderEditRepair(repair);

  return `
    <article class="repair">
      <div class="photo">${repair.photo ? `<img src="${escapeHtml(repair.photo)}" alt="${escapeHtml(repair.location)}维修照片">` : "未添加照片"}</div>
      <div class="content">
        <div class="row">
          <h3 class="edit-title" data-edit="${repair.id}" title="点击编辑">${escapeHtml(repair.location)}</h3>
          <span class="priority ${repair.priority}">${priorities[repair.priority]}</span>
          <span class="status ${repair.status}">${statuses[repair.status]}</span>
        </div>
        <p>${escapeHtml(repair.title)}</p>
        <div class="row">
          <span class="chip">${repair.status === "done" ? "支出" : "预计"} ¥${Number(repair.cost || 0)}</span>
          ${repair.completedAt ? `<span class="chip done-time">完成于 ${formatDateTime(repair.completedAt)}</span>` : ""}
          <span class="chip">${escapeHtml(repair.note || "暂无备注")}</span>
        </div>
        <div class="actions">
          <select data-status="${repair.id}">${renderStatusOptions(repair.status)}</select>
          <button class="ghost" data-edit="${repair.id}">编辑</button>
          <button class="ghost" data-delete="${repair.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}

function renderEditRepair(repair) {
  return `
    <article class="repair editing">
      <form class="edit-form" data-edit-form="${repair.id}">
        <label>位置<input name="location" required value="${escapeHtml(repair.location)}"></label>
        <label>优先级<select name="priority">${renderPriorityOptions(repair.priority)}</select></label>
        <label>预计费用<input name="cost" type="number" min="0" step="1" value="${Number(repair.cost || 0)}"></label>
        <label>处理状态<select name="status">${renderStatusOptions(repair.status)}</select></label>
        <label class="wide">问题描述<textarea name="title" required>${escapeHtml(repair.title)}</textarea></label>
        <label class="wide">照片链接<input name="photo" type="url" value="${escapeHtml(repair.photo || "")}" placeholder="可选，粘贴图片地址"></label>
        <label class="wide">备注<textarea name="note" placeholder="师傅电话、材料或注意事项">${escapeHtml(repair.note || "")}</textarea></label>
        <div class="wide edit-actions">
          <button class="primary" type="submit">保存修改</button>
          <button class="ghost" type="button" data-cancel="${repair.id}">取消</button>
        </div>
      </form>
    </article>
  `;
}

function renderStatusOptions(selected) {
  return Object.entries(statuses)
    .filter(([value]) => value !== "all")
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function renderPriorityOptions(selected) {
  return Object.entries(priorities)
    .map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function formatDateTime(iso) {
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function bindEvents() {
  document.querySelector("#repair-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    const repair = {
      id: crypto.randomUUID(),
      location: data.location.trim(),
      title: data.title.trim(),
      priority: data.priority,
      cost: Number(data.cost || 0),
      status: data.status,
      photo: data.photo.trim(),
      note: data.note.trim(),
      completedAt: null
    };
    applyStatus(repair, data.status);
    state.repairs.unshift(repair);
    saveState();
    render();
  });

  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-status]").forEach((select) => {
    select.addEventListener("change", () => {
      const repair = state.repairs.find((item) => item.id === select.dataset.status);
      applyStatus(repair, select.value);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-edit]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      state.editingId = trigger.dataset.edit;
      render();
    });
  });

  document.querySelectorAll("[data-edit-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const repair = state.repairs.find((item) => item.id === form.dataset.editForm);
      const data = Object.fromEntries(new FormData(form));
      repair.location = data.location.trim();
      repair.title = data.title.trim();
      repair.priority = data.priority;
      repair.cost = Number(data.cost || 0);
      repair.photo = data.photo.trim();
      repair.note = data.note.trim();
      applyStatus(repair, data.status);
      state.editingId = null;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      state.editingId = null;
      render();
    });
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.repairs = state.repairs.filter((repair) => repair.id !== button.dataset.delete);
      saveState();
      render();
    });
  });
}

function filteredRepairs() {
  if (state.filter === "all") return state.repairs;
  return state.repairs.filter((repair) => repair.status === state.filter);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char]);
}

render();
