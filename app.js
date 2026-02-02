const SIZE = 5;
const CENTER = [2,2];
const EMPTY = ".";
const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const state = {
  board: initBoard(),
  phase: "placement",
  turnPlace: "A",
  remaining: {A:12, B:12},
  placeCountInTurn: 0,

  phaseMoveTurn: "B",        // الحركة تبدأ بـ B
  selected: null,

  vsAi: true,
  aiBusy: false,

  capturedFrom: {A:0, B:0},  // قطع خرجت من اللعبة: مأكول من A / مأكول من B
  lastMove: null,            // {player, frm:[r,c], to:[r,c], cap}

  aiPick: null,              // لتحديد حجر AI قبل الحركة {fromKey, toKey}

  names: {
    A: "Player A",
    B: "AI"
  },

  lock: false
};

/* ---------- INIT ---------- */
function initBoard(){
  return Array.from({length:SIZE}, () => Array.from({length:SIZE}, () => EMPTY));
}
function other(p){ return p === "A" ? "B" : "A"; }
function inBounds(r,c){ return r>=0 && r<SIZE && c>=0 && c<SIZE; }
function isCenter(r,c){ return r===CENTER[0] && c===CENTER[1]; }
function rcKey(r,c){ return `${r},${c}`; }

/* ---------- GAME LOGIC ---------- */
function validPlacement(r,c){
  if(isCenter(r,c)) return false;
  return state.board[r][c] === EMPTY;
}

function legalMovesFrom(player, pos){
  const [r,c] = pos;
  if(state.board[r][c] !== player) return [];
  const moves = [];
  for(const [dr,dc] of DIRS){
    const tr=r+dr, tc=c+dc;
    if(inBounds(tr,tc) && state.board[tr][tc]===EMPTY){
      moves.push([[r,c],[tr,tc]]);
    }
  }
  return moves;
}

function computeCaptures(board, player, movedTo){
  const [r,c]=movedTo;
  const opp = other(player);
  const toRemove = [];
  for(const [dr,dc] of DIRS){
    const r1=r+dr, c1=c+dc;
    const r2=r+2*dr, c2=c+2*dc;
    if(inBounds(r1,c1) && inBounds(r2,c2)){
      if(board[r1][c1]===opp && board[r2][c2]===player){
        toRemove.push([r1,c1]);
      }
    }
  }
  return toRemove;
}

function doMove(player, frm, to){
  const [fr,fc]=frm, [tr,tc]=to;
  state.board[fr][fc]=EMPTY;
  state.board[tr][tc]=player;

  const removed = computeCaptures(state.board, player, [tr,tc]);
  for(const [rr,cc] of removed){
    state.board[rr][cc]=EMPTY;
  }
  return removed; // positions
}

function hasAnyMove(player){
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      if(state.board[r][c]===player){
        if(legalMovesFrom(player,[r,c]).length>0) return true;
      }
    }
  }
  return false;
}

function countPieces(){
  let A=0,B=0;
  for(const row of state.board){
    for(const cell of row){
      if(cell==="A") A++;
      if(cell==="B") B++;
    }
  }
  return {A,B};
}

function checkWinner(){
  const cnt = countPieces();
  if(cnt.A===0) return "B";
  if(cnt.B===0) return "A";

  if(state.phase==="movement"){
    if(!hasAnyMove("A")) return "B";
    if(!hasAnyMove("B")) return "A";
  }
  return null;
}

/* ---------- UI ELEMENTS ---------- */
const boardEl = $("board");
const statusLine = $("statusLine");
const hintLine = $("hintLine");

const vsAiEl = $("vsAi");
const resetBtn = $("resetBtn");

const capAEl = $("capA");
const capBEl = $("capB");
const miniA = $("miniA");
const miniB = $("miniB");

const toast = $("toast");
const animLayer = $("animLayer");

const winOverlay = $("winOverlay");
const winTitle = $("winTitle");
const winText = $("winText");
const playAgainBtn = $("playAgainBtn");
const closeWinBtn = $("closeWinBtn");

const settingsBtn = $("settingsBtn");
const settingsModal = $("settingsModal");
const nameAInput = $("nameA");
const nameBInput = $("nameB");
const saveNamesBtn = $("saveNamesBtn");
const closeNamesBtn = $("closeNamesBtn");

/* ---------- EVENTS ---------- */
vsAiEl.addEventListener("change", () => {
  state.vsAi = !!vsAiEl.checked;
  state.names.B = state.vsAi ? (state.names.B || "AI") : (state.names.B === "AI" ? "Player B" : state.names.B);
  saveNamesToStorage();
  toastMsg(state.vsAi ? "✅ وضع الذكاء الاصطناعي" : "✅ وضع لاعبين على نفس الجهاز");
  render();
});

resetBtn.addEventListener("click", resetGame);

playAgainBtn.addEventListener("click", () => { winOverlay.style.display="none"; resetGame(); });
closeWinBtn.addEventListener("click", () => { winOverlay.style.display="none"; });

settingsBtn.addEventListener("click", openNamesModal);
closeNamesBtn.addEventListener("click", () => settingsModal.style.display="none");
saveNamesBtn.addEventListener("click", () => {
  state.names.A = cleanName(nameAInput.value, "Player A");
  state.names.B = cleanName(nameBInput.value, state.vsAi ? "AI" : "Player B");
  saveNamesToStorage();
  settingsModal.style.display="none";
  toastMsg("✅ تم حفظ الأسماء");
  render();
});

function cleanName(v, fallback){
  const s = (v||"").trim();
  return s ? s.slice(0,18) : fallback;
}

/* ---------- STORAGE ---------- */
function loadNamesFromStorage(){
  try{
    const raw = localStorage.getItem("seeja_names_v1");
    if(!raw) return false;
    const obj = JSON.parse(raw);
    if(obj && obj.A) state.names.A = obj.A;
    if(obj && obj.B) state.names.B = obj.B;
    return true;
  }catch{ return false; }
}
function saveNamesToStorage(){
  localStorage.setItem("seeja_names_v1", JSON.stringify(state.names));
}

/* ---------- TOAST ---------- */
let toastTimer=null;
function toastMsg(text){
  toast.textContent = text;
  toast.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.style.display="none", 1200);
}

/* ---------- MODAL ---------- */
function openNamesModal(){
  nameAInput.value = state.names.A || "Player A";
  nameBInput.value = state.names.B || (state.vsAi ? "AI" : "Player B");
  settingsModal.style.display="flex";
}

/* ---------- RENDER ---------- */
function setStatus(line, hint){
  statusLine.textContent = line;
  hintLine.textContent = hint;
}

function render(){
  // benches
  capAEl.textContent = state.capturedFrom.A;
  capBEl.textContent = state.capturedFrom.B;

  miniA.innerHTML = "";
  miniB.innerHTML = "";
  for(let i=0;i<Math.min(state.capturedFrom.A, 40); i++){
    const d=document.createElement("div");
    d.className="mini A";
    miniA.appendChild(d);
  }
  for(let i=0;i<Math.min(state.capturedFrom.B, 40); i++){
    const d=document.createElement("div");
    d.className="mini B";
    miniB.appendChild(d);
  }

  // status
  if(state.phase==="placement"){
    setStatus(
      `مرحلة الرص — الدور: ${state.turnPlace}  (${state.turnPlace==="A" ? state.names.A : state.names.B})`,
      `كل دور: حجرين | C3 ممنوع رص | المتبقي A=${state.remaining.A} , B=${state.remaining.B}`
    );
  } else {
    const w = checkWinner();
    if(w){
      showWinner(w);
    }else{
      const who = state.phaseMoveTurn;
      const nm = (who==="A") ? state.names.A : state.names.B;
      setStatus(
        `مرحلة الحركة — الدور: ${who} (${nm})`,
        state.vsAi && who==="B" ? "الذكاء الاصطناعي يتحرك..." : "اضغط على حجرك ثم اضغط على خانة فاضية."
      );
    }
  }

  // board
  boardEl.innerHTML = "";

  const lastFrom = state.lastMove ? rcKey(...state.lastMove.frm) : null;
  const lastTo   = state.lastMove ? rcKey(...state.lastMove.to)  : null;
  const lastP    = state.lastMove ? state.lastMove.player : null;

  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const cell = document.createElement("div");
      cell.className = "cell";
      const key = rcKey(r,c);

      if(isCenter(r,c) && state.board[r][c]===EMPTY) cell.classList.add("centerEmpty");

      if(state.selected && state.selected[0]===r && state.selected[1]===c) cell.classList.add("selected");

      if(state.aiPick){
        if(state.aiPick.fromKey===key) cell.classList.add("aiPick");
      }

      if(lastFrom===key && lastP) cell.classList.add("lastFrom", lastP);
      if(lastTo===key && lastP) cell.classList.add("lastTo", lastP);

      const v = state.board[r][c];
      if(v==="A" || v==="B"){
        const p = document.createElement("div");
        p.className = `piece ${v}`;
        p.textContent = v;
        cell.appendChild(p);
      }

      cell.addEventListener("click", () => onCellClick(r,c));
      boardEl.appendChild(cell);
    }
  }
}

/* ---------- MOVE ANIMATIONS ---------- */
function cellCenterPos(r,c){
  const idx = r*SIZE + c;
  const el = boardEl.children[idx];
  const rect = el.getBoundingClientRect();
  return {x: rect.left + rect.width/2, y: rect.top + rect.height/2};
}

function benchTargetPos(victim){
  // victim "A" means piece of A goes to bench A (capturedFrom.A count area)
  const targetEl = (victim==="A") ? capAEl : capBEl;
  const rect = targetEl.getBoundingClientRect();
  return {x: rect.left + rect.width/2, y: rect.top + rect.height/2 + 28};
}

async function animateSlide(player, frm, to){
  const from = cellCenterPos(frm[0], frm[1]);
  const dest = cellCenterPos(to[0], to[1]);

  const fly = document.createElement("div");
  fly.className = `flyPiece ${player}`;
  fly.textContent = player;
  fly.style.left = from.x + "px";
  fly.style.top  = from.y + "px";
  animLayer.appendChild(fly);

  // start frame
  await sleep(10);
  fly.style.left = dest.x + "px";
  fly.style.top  = dest.y + "px";

  await sleep(360);
  fly.remove();
}

async function animateToBench(victim, pos){
  const from = cellCenterPos(pos[0], pos[1]);
  const dest = benchTargetPos(victim);

  const fly = document.createElement("div");
  fly.className = `flyPiece ${victim}`;
  fly.textContent = victim;
  fly.style.left = from.x + "px";
  fly.style.top  = from.y + "px";
  animLayer.appendChild(fly);

  const boom = document.createElement("div");
  boom.className = "boom";
  boom.textContent = "💥";
  boom.style.left = dest.x + "px";
  boom.style.top  = dest.y + "px";
  animLayer.appendChild(boom);

  await sleep(10);
  fly.style.left = dest.x + "px";
  fly.style.top  = dest.y + "px";
  fly.style.transform = "translate(-50%,-50%) scale(.55)";
  fly.style.opacity = "0.15";

  await sleep(220);
  boom.style.opacity = "1";
  boom.style.transform = "translate(-50%,-50%) scale(1.2)";

  await sleep(200);
  boom.style.opacity = "0";
  boom.style.transform = "translate(-50%,-50%) scale(.8)";

  await sleep(120);
  fly.remove();
  boom.remove();
}

/* ---------- INPUT HANDLING ---------- */
async function onCellClick(r,c){
  if(state.lock) return;

  // placement
  if(state.phase==="placement"){
    // if AI: user places only A
    if(state.vsAi && state.turnPlace==="B"){
      toastMsg("⏳ الذكاء الاصطناعي يرص تلقائيًا");
      return;
    }

    if(!validPlacement(r,c)){
      toastMsg("❌ غير مسموح (الخانة مشغولة أو C3)");
      return;
    }

    state.board[r][c] = state.turnPlace;
    state.remaining[state.turnPlace]--;
    state.placeCountInTurn++;

    render();

    if(state.placeCountInTurn < 2){
      toastMsg("ضع الحجر الثاني");
      return;
    }

    // end placement turn
    state.placeCountInTurn = 0;
    state.turnPlace = other(state.turnPlace);

    // AI places two
    if(state.vsAi && state.turnPlace==="B"){
      aiPlaceTwo();
      state.turnPlace="A";
      render();
      toastMsg("🤖 AI رص حجرين");
    } else {
      render();
    }

    if(state.remaining.A===0 && state.remaining.B===0){
      state.phase="movement";
      state.phaseMoveTurn="B";
      state.selected=null;
      state.lastMove=null;
      render();

      if(state.vsAi){
        await sleep(350);
        await aiPlayTurn(); // يبدأ مباشرة
      } else {
        toastMsg("✅ اكتمل الرص — B يبدأ الحركة");
      }
    }
    return;
  }

  // movement
  const player = state.phaseMoveTurn;

  // block clicks if AI's turn
  if(state.vsAi && player==="B"){
    return;
  }

  if(!state.selected){
    if(state.board[r][c]!==player){
      toastMsg("اختار حجرك أولاً");
      return;
    }
    state.selected=[r,c];
    render();
    return;
  }

  // destination
  if(state.board[r][c]!==EMPTY){
    toastMsg("اختر خانة فاضية");
    return;
  }

  const frm = state.selected;
  const to = [r,c];
  const legal = legalMovesFrom(player, frm).some(m => m[1][0]===to[0] && m[1][1]===to[1]);
  if(!legal){
    toastMsg("حركة غير صحيحة (خطوة واحدة)");
    return;
  }

  // animate move
  state.lock = true;
  await animateSlide(player, frm, to);

  // apply
  state.selected=null;
  const removed = doMove(player, frm, to);

  state.lastMove = {player, frm, to, cap: removed.length};
  render();

  // captures animate to bench
  if(removed.length){
    const victim = other(player);
    for(const p of removed){
      await animateToBench(victim, p);
      state.capturedFrom[victim] += 1;
      render();
    }

    // chain rule: can continue only if next move causes capture
    // simplified for now: after any capture, allow one extra check for more captures from new position
    // (keeps the rule you want without UX complexity)
    const more = hasCaptureFrom(player, to);
    if(more){
      toastMsg("✅ يمكنك متابعة السلسلة (أكل إضافي متاح)");
      state.selected = to; // نفس الحجر
      render();
      state.lock = false;
      return;
    }
  }

  // end turn
  const w = checkWinner();
  if(w){
    showWinner(w);
    state.lock=false;
    return;
  }

  state.phaseMoveTurn = other(state.phaseMoveTurn);
  render();

  state.lock = false;

  if(state.vsAi && state.phaseMoveTurn==="B"){
    await sleep(450);
    await aiPlayTurn();
  }
}

function hasCaptureFrom(player, pos){
  const moves = legalMovesFrom(player, pos);
  for(const [frm,to] of moves){
    const boardCopy = state.board.map(row => row.slice());
    // simulate
    boardCopy[frm[0]][frm[1]]=EMPTY;
    boardCopy[to[0]][to[1]]=player;
    const removed = computeCaptures(boardCopy, player, to);
    if(removed.length) return true;
  }
  return false;
}

/* ---------- AI ---------- */
function aiPlaceTwo(){
  const empties = [];
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      if(validPlacement(r,c)) empties.push([r,c]);
    }
  }
  shuffle(empties);
  for(let i=0;i<2 && state.remaining.B>0 && empties.length;i++){
    const [r,c]=empties.pop();
    state.board[r][c]="B";
    state.remaining.B--;
  }
}

function aiChooseMove(){
  const candidates=[];
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      if(state.board[r][c]==="B"){
        const moves = legalMovesFrom("B",[r,c]);
        for(const [frm,to] of moves){
          // score by captures
          const b = state.board.map(row=>row.slice());
          b[frm[0]][frm[1]]=EMPTY;
          b[to[0]][to[1]]="B";
          const caps = computeCaptures(b,"B",to).length;
          candidates.push({frm,to,caps});
        }
      }
    }
  }
  if(!candidates.length) return null;
  candidates.sort((x,y)=>y.caps - x.caps);
  return candidates[0];
}

async function aiPlayTurn(){
  if(!state.vsAi) return;
  if(state.phaseMoveTurn!=="B") return;
  if(state.aiBusy) return;

  state.aiBusy = true;
  state.lock = true;

  // delay so user sees the turn
  await sleep(650);

  const mv = aiChooseMove();
  if(!mv){
    // no moves -> A wins
    showWinner("A");
    state.aiBusy=false;
    state.lock=false;
    return;
  }

  // show pick highlight
  state.aiPick = {fromKey: rcKey(...mv.frm), toKey: rcKey(...mv.to)};
  render();
  await sleep(450);

  // animate slide
  await animateSlide("B", mv.frm, mv.to);

  // apply move
  const removed = doMove("B", mv.frm, mv.to);
  state.lastMove = {player:"B", frm: mv.frm, to: mv.to, cap: removed.length};
  state.aiPick = null;
  render();

  // animate captures to bench
  if(removed.length){
    for(const p of removed){
      await animateToBench("A", p);
      state.capturedFrom["A"] += 1;
      render();
    }

    // chain capture rule (only if next capture exists)
    let cur = mv.to;
    while(hasCaptureFrom("B", cur)){
      await sleep(420);

      // choose a capture-producing move from cur
      const moves = legalMovesFrom("B", cur);
      let chosen=null;
      for(const [frm,to] of moves){
        const b = state.board.map(row=>row.slice());
        b[frm[0]][frm[1]]=EMPTY;
        b[to[0]][to[1]]="B";
        const caps = computeCaptures(b,"B",to).length;
        if(caps>0){ chosen={frm,to}; break; }
      }
      if(!chosen) break;

      // highlight chain pick quickly
      state.aiPick = {fromKey: rcKey(...chosen.frm), toKey: rcKey(...chosen.to)};
      render();
      await sleep(320);

      await animateSlide("B", chosen.frm, chosen.to);
      const removed2 = doMove("B", chosen.frm, chosen.to);
      state.lastMove = {player:"B", frm: chosen.frm, to: chosen.to, cap: removed2.length};
      state.aiPick=null;
      render();

      for(const p of removed2){
        await animateToBench("A", p);
        state.capturedFrom["A"] += 1;
        render();
      }

      cur = chosen.to;
    }
  }

  const w = checkWinner();
  if(w){ showWinner(w); state.aiBusy=false; state.lock=false; return; }

  state.phaseMoveTurn="A";
  render();

  state.aiBusy=false;
  state.lock=false;
}

/* ---------- WINNER ---------- */
function showWinner(w){
  const winnerName = (w==="A") ? state.names.A : state.names.B;
  winTitle.textContent = `🏆 الفائز: ${w}`;
  winText.textContent = `🎉 مبروك ${winnerName}!`;
  winOverlay.style.display="flex";
}

/* ---------- RESET ---------- */
function resetGame(){
  state.board = initBoard();
  state.phase = "placement";
  state.turnPlace = "A";
  state.remaining = {A:12, B:12};
  state.placeCountInTurn = 0;

  state.phaseMoveTurn = "B";
  state.selected = null;

  state.capturedFrom = {A:0, B:0};
  state.lastMove = null;

  state.aiPick = null;
  state.aiBusy = false;

  state.lock = false;

  winOverlay.style.display="none";

  // adjust name B if vsAi changed
  if(state.vsAi && state.names.B.trim().toLowerCase()==="player b") state.names.B="AI";
  if(!state.vsAi && state.names.B.trim().toLowerCase()==="ai") state.names.B="Player B";

  render();
  toastMsg("🔄 تم إعادة اللعبة");
}

/* ---------- UTIL ---------- */
function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
}

/* ---------- BOOT ---------- */
(function boot(){
  loadNamesFromStorage();
  state.vsAi = !!vsAiEl.checked;

  // ensure defaults
  state.names.A = cleanName(state.names.A, "Player A");
  state.names.B = cleanName(state.names.B, state.vsAi ? "AI" : "Player B");
  saveNamesToStorage();

  render();

  // show names modal on first visit only
  const seen = localStorage.getItem("seeja_seen_names_v1");
  if(!seen){
    localStorage.setItem("seeja_seen_names_v1","1");
    openNamesModal();
  }
})();
