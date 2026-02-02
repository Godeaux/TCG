/**
 * Studio UI — connects via WebSocket to the studio server
 * and renders real-time agent activity.
 */

const statusEl = document.getElementById('studio-status');
const agentListEl = document.getElementById('agent-list');
const eventFeedEl = document.getElementById('event-feed');
const fileFeedEl = document.getElementById('file-feed');
const taskColumns = {
  pending: document.querySelector('[data-status="pending"] .task-list'),
  active: document.querySelector('[data-status="active"] .task-list'),
  completed: document.querySelector('[data-status="completed"] .task-list'),
};

/** Tracked state */
const agents = new Map();
const tasks = new Map();

/** WebSocket connection */
function connect() {
  const ws = new WebSocket(`ws://${location.host}`);

  ws.onopen = () => {
    statusEl.textContent = 'Connected';
    statusEl.className = 'status connected';
  };

  ws.onclose = () => {
    statusEl.textContent = 'Disconnected';
    statusEl.className = 'status disconnected';
    setTimeout(connect, 2000);
  };

  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'history') {
      data.events.forEach(handleEvent);
    } else if (data.type === 'event') {
      handleEvent(data.event);
    }
  };
}

function handleEvent(event) {
  const { type, agentId, taskId, data, timestamp } = event;

  // Agent events
  if (type === 'agent:spawned') {
    agents.set(agentId, { id: agentId, role: data.role, status: 'idle' });
    renderAgents();
  }
  if (type === 'agent:thinking') {
    const a = agents.get(agentId);
    if (a) { a.status = 'thinking'; renderAgents(); }
  }
  if (type === 'agent:idle') {
    const a = agents.get(agentId);
    if (a) { a.status = 'idle'; renderAgents(); }
  }
  if (type === 'agent:error') {
    const a = agents.get(agentId);
    if (a) { a.status = 'error'; renderAgents(); }
  }

  // Task events
  if (type === 'task:assigned') {
    tasks.set(taskId, { id: taskId, desc: data.description, status: 'active', agentId });
    renderTasks();
  }
  if (type === 'task:completed') {
    const t = tasks.get(taskId);
    if (t) { t.status = 'completed'; renderTasks(); }
  }

  // File events
  if (type?.startsWith('file:')) {
    appendFile(type.split(':')[1], data.path, timestamp);
  }

  // All events go to timeline
  appendTimeline(event);
}

function renderAgents() {
  agentListEl.innerHTML = '';
  for (const agent of agents.values()) {
    const card = document.createElement('div');
    card.className = 'agent-card';
    card.innerHTML = `
      <span class="status-dot ${agent.status}"></span>
      <span class="name">${agent.id}</span>
      <div class="role">${agent.role}</div>
    `;
    agentListEl.appendChild(card);
  }
}

function renderTasks() {
  for (const col of Object.values(taskColumns)) col.innerHTML = '';
  for (const task of tasks.values()) {
    const col = taskColumns[task.status] || taskColumns.pending;
    const card = document.createElement('div');
    card.className = `task-card ${task.status}`;
    card.textContent = task.desc;
    col.appendChild(card);
  }
}

function appendTimeline(event) {
  const entry = document.createElement('div');
  entry.className = 'event-entry';
  const t = new Date(event.timestamp).toLocaleTimeString();
  const shortType = event.type?.split(':')[1] || event.type;
  entry.innerHTML = `
    <span class="time">${t}</span>
    <span class="agent">${event.agentId || '—'}</span>
    <span class="msg">${shortType} ${event.data?.path || event.data?.description || ''}</span>
  `;
  eventFeedEl.prepend(entry);
  // Keep feed manageable
  while (eventFeedEl.children.length > 200) eventFeedEl.lastChild.remove();
}

function appendFile(action, filePath, timestamp) {
  const entry = document.createElement('div');
  entry.className = `file-entry ${action}`;
  const t = new Date(timestamp).toLocaleTimeString();
  entry.textContent = `${t} [${action}] ${filePath}`;
  fileFeedEl.prepend(entry);
  while (fileFeedEl.children.length > 100) fileFeedEl.lastChild.remove();
}

connect();
