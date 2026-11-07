// STRIKE ZONE — онлайн-сервер. Запуск: npm install && npm start  (порт 8080 или переменная PORT)
// Сервер хранит здоровье, убийства и смерти игроков и проверяет урон; игра раздаётся с этого же адреса.
const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const PORT = process.env.PORT || 8080, MAP = 0, TARGET = 15;   // MAP: 0 — «Склад», 1 — «Арена»; TARGET — убийств до победы

// Раздаём strike-zone.html (положите его рядом с этим файлом)
const srv = http.createServer((q, r) => {
  fs.readFile(path.join(__dirname, 'strike-zone.html'), (e, d) => {
    if (e) { r.writeHead(404); return r.end('strike-zone.html не найден'); }
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d);
  });
});
const wss = new WebSocketServer({ server: srv });
const players = new Map();   // ws -> состояние игрока
let nextId = 1;

const send = (ws, o) => ws.readyState === 1 && ws.send(JSON.stringify(o));
const all = (o, except) => { for (const ws of players.keys()) if (ws !== except) send(ws, o); };
const num3 = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);

// Обработка заявленного попадания: проверяем лимит частоты и максимум урона
function hit(ws, me, m) {
  const now = Date.now();
  if (now - me.ht > 1000) { me.ht = now; me.hits = 0 }
  if (++me.hits > 60 || !me.al) return;
  const found = [...players.entries()].find(([, p]) => p.id === m.id);
  if (!found) return;
  const [vws, v] = found;
  if (!v.al || v === me) return;
  v.hp -= Math.min(300, Math.max(0, +m.d || 0));
  if (v.hp > 0) return send(vws, { t: 'hp', hp: v.hp });
  v.hp = 0; v.al = false; v.d++; me.k++;
  send(vws, { t: 'die' }); send(ws, { t: 'kill', v: v.n });
  all({ t: 'feed', x: `${me.n} убил ${v.n}` });
  setTimeout(() => { v.hp = 100; v.al = true }, 3100);          // респавн
  if (me.k >= TARGET) {                                          // конец раунда
    all({ t: 'end', win: me.id }); me.k = TARGET;
    setTimeout(() => { for (const p of players.values()) { p.k = p.d = 0; p.hp = 100; p.al = true } }, 8000);
  }
}

wss.on('connection', ws => {
  let me = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw) } catch { return }
    if (m.t === 'join' && !me) {
      me = { id: nextId++, n: String(m.n || 'Игрок').slice(0, 14), x: 0, y: 0, z: 0, yaw: 0, hp: 100, al: true, k: 0, d: 0, hits: 0, ht: 0 };
      players.set(ws, me); send(ws, { t: 'welcome', id: me.id, map: MAP }); all({ t: 'feed', x: me.n + ' подключился' });
    }
    if (!me) return;
    if (m.t === 's' && [m.x, m.y, m.z, m.yaw].every(Number.isFinite)) { me.x = m.x; me.y = m.y; me.z = m.z; me.yaw = m.yaw }
    else if (m.t === 'f' && me.al && num3(m.a) && num3(m.b)) all({ t: 'f', a: m.a, b: m.b }, ws);   // трассеры выстрелов
    else if (m.t === 'heal' && me.al) me.hp = 100;
    else if (m.t === 'hit') hit(ws, me, m);
  });
  ws.on('close', () => { if (me) all({ t: 'feed', x: me.n + ' вышел' }); players.delete(ws) });
});

// Снимок мира 20 раз в секунду
setInterval(() => {
  const p = [...players.values()].map(q => ({ id: q.id, n: q.n, x: q.x, y: q.y, z: q.z, yaw: q.yaw, hp: q.hp, al: q.al, k: q.k, d: q.d }));
  all({ t: 'w', p });
}, 50);

srv.listen(PORT, () => console.log('STRIKE ZONE: http://localhost:' + PORT));
