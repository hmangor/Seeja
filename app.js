const SIZE = 5;
const CENTER = [2,2];
const EMPTY = ".";
const DIRS = [[-1,0],[1,0],[0,-1],[0,1]];

const $ = (id) => document.getElementById(id);

const state = {
  board: initBoard(),
  phase: "placement",       // placement | movement
  turnPlace: "A",
  remaining: {A:12, B:12},
  placeCountInTurn: 0,

  turnMove: "B",            // movement starts with B
  selected: null,

  chainAllowed: false,
  lastMoverPos: null,

  vsAi: true,

  capturedFrom: {A:0, B:0},
  lastMove: null, // {player, frm:[r,c], to:[r,c], cap}

  // capture animation support
  lastCaptured: null, // {victim:"A"|"B", positions:[[r,c],...]}

  // names
  namesLocked: false,
  nameA: "Player A",
  nameB: "Player B",

  lock: false
};

function initBoard(){
  return Array.from({length:SIZE}, () => Array.from({length:SIZE}, () => EMPTY));
}
function other(p){ return p === "A" ? "B" : "A"; }
function inBounds(r,c){ return r>=0 && r<SIZE && c>=0 && c<SIZE; }
function rcToLabel(r,c){ return String.fromCharCode(65+c) + (r+1); }
function isCenter(r,c){ return r===CENTER[0] && c===CENTER[1]; }

function validPlacement(r,c){
  if(isCenter(r,c)) return false;
  return state.board[r][c] === EMPTY;
}

function legalMovesFromPiece(player, pos){
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

// capture helper that returns removed positions for animation
function computeCaptures(player, movedTo){
  const [r,c]=movedTo;
  const opp = other(player);
  const toRemove = [];
  for(const [dr,dc] of DIRS){
    const r1=r+dr, c1=c+dc;
    const r2=r+2*dr, c2=c+2*dc;
    if(inBounds(r1,c1) && inBounds(r2,c2)){
      if(state.board[r1][c1]===opp && state.board[r2][c2]===player){
        toRemove.push([r1,c1]);
      }
    }
  }
  return toRemove;
}

function applyCaptures(player, movedTo){
  const toRemove = computeCaptures(player, movedTo);
  for(const [rr,cc] of toRemove){
    state.board[rr][cc]=EMPTY;
  }
  return toRemove;
}

function doMove(player, frm, to){
  const [fr,fc]=frm, [tr,tc]=to;
  state.board[fr][fc]=EMPTY;
  state.board[tr][tc]=player;

  const removed = applyCaptures(player, [tr,tc]);
  if(removed.length){
    state.lastCaptured = { victim: other(player), positions: removed };
    // clear after animation
    setTimeout(() => {
      state.lastCaptured = null;
      render(false);
    }, 650);
  }
  return removed.length;
}

function capturingMovesFromPiece(player, pos){
  const caps = [];
  const moves = legalMovesFromPiece(player, pos);
  for(const [frm,to] of moves){
    const b = cloneBoard(state.board);
    const cap = simulateMove(b, player, frm, to);
    if(cap>0) caps.push([frm,to,cap]);
  }
  return caps;
}

function cloneBoard(b){ return b.map(row => row.slice()); }

function simulateMove(b, player, frm, to){
  const [fr,fc]=frm, [tr,tc]=to;
  b[fr][fc]=EMPTY;
  b[tr][tc]=player;

  const opp = other(player);
  const toRemove = [];
  for(const [dr,dc] of DIRS){
    const r1=tr+dr, c1=tc+dc;
    const r2=tr+2*dr, c2=tc+2*dc;
    if(inBounds(r1,c1) && inBounds(r2,c2)){
      if(b[r1][c1]===opp && b[r2][c2]===player){
        toRemove.push([r1,c1]);
      }
    }
  }
  for(const [rr,cc] of toRemove){ b[rr][cc]=EMPTY; }
  return toRemove.length;
}

function hasAnyMove(player){
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      if(state.board[r][c]===player){
        if(legalMovesFromPiece(player,[r,c]).length>0) return true;
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

// ---------- AI ----------
function aiPlaceTwo(){
  const empties = [];
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      if(validPlacement(r,c)) empties.push([r,c]);
    }
  }
  shuffle(empties);
  let placed=0;
  while(placed<2 && state.remaining.B>0 && empties.length){
    const [r,c]=empties.pop();
    state.board[r][c]="B";
    state.remaining.B--;
    placed++;
  }
}

function aiChooseMove(){
  const moves=[];
  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      if(state.board[r][c]==="B"){
        moves.push(...legalMovesFromPiece("B",[r,c]));
      }
    }
  }
  shuffle(moves);
  let best=null, bestCap=-1;
  for(const [frm,to] of moves){
    const b = cloneBoard(state.board);
    const cap = simulateMove(b,"B",frm,to);
    if(cap>bestCap){
      bestCap=cap;
      best=[frm,to,cap];
    }
  }
  return best;
}

async function aiPlayTurn(){
  if(!state.vsAi) return;
  if(state.turnMove!=="B") return;

  state.lock = true;

  // slower AI (clear for humans)
  await sleep(700);

  const mv = aiChooseMove();
  if(!mv){
    state.lock=false;
    return;
  }
  const [frm,to] = mv;
  const cap1 = doMove("B", frm, to);

  state.capturedFrom["A"] += cap1;
  state.lastMove = {player:"B", frm, to, cap:cap1};

  render(true);

  if(cap1>0){
    let cur = to;
    while(true){
      const caps = capturingMovesFromPiece("B", cur);
      if(!caps.length) break;

      caps.sort((a,b)=>b[2]-a[2]);
      const [frm2,to2,_] = caps[0];

      await sleep(600); // slower chain
      const capn = doMove("B", frm2, to2);
      state.capturedFrom["A"] += capn;
      state.lastMove = {player:"B", frm:frm2, to:to2, cap:capn};

      cur = to2;
      render(true);
      if(capn<=0) break;
    }
  }

  const w = checkWinner();
  if(w){
    showWinner(w);
    state.lock=false;
    return;
  }

  state.turnMove = "A";
  setStatus(`دور ${state.nameA} (A) للحركة.`, "اضغط حجرك ثم على خانة فاضية.");
  state.lock=false;
}

// ---------- UI ----------
const boardEl = $("board");
const vsAiEl = $("vsAi");
const resetBtn = $("resetBtn");

const statusLine = $("statusLine");
const hintLine = $("hintLine");

const chainActions = $("chainActions");
const continueChainBtn = $("continueChainBtn");
const endTurnBtn = $("endTurnBtn");

const capAEl = $("capA");
const capBEl = $("capB");
const dotsA = $("dotsA");
const dotsB = $("dotsB");
const lastMoveBox = $("lastMoveBox");

const nameAInput = $("nameA");
const nameBInput = $("nameB");
const nameNote = $("nameNote");

const winOverlay = $("winOverlay");
const winTitle = $("winTitle");
const winText = $("winText");
const playAgainBtn = $("playAgainBtn");
const closeWinBtn = $("closeWinBtn");

vsAiEl.addEventListener("change", () => {
  state.vsAi = !!vsAiEl.checked;

  // If AI ON, nameB placeholder becomes AI and locked label text changes
  if(state.vsAi && !state.namesLocked){
    if(!nameBInput.value.trim()) nameBInput.value = "AI";
  }
  render(false);
});

resetBtn.addEventListener("click", () => resetGame());

nameAInput.addEventListener("input", () => {
  if(state.namesLocked) return;
  state.nameA = cleanName(nameAInput.value, "Player A");
  render(false);
});
nameBInput.addEventListener("input", () => {
  if(state.namesLocked) return;
  state.nameB = cleanName(nameBInput.value, state.vsAi ? "AI" : "Player B");
  render(false);
});

continueChainBtn.addEventListener("click", () => {
  setStatus("وضع السلسلة: أكمل بنفس الحجر.", `اضغط الحجر في ${rcToLabel(...state.lastMoverPos)} ثم الوجهة (لازم أكل).`);
});

endTurnBtn.addEventListener("click", () => {
  state.chainAllowed=false;
  state.lastMoverPos=null;
  state.selected=null;
  chainActions.style.display="none";
  endTurn();
  render(true);
});

playAgainBtn.addEventListener("click", () => {
  winOverlay.style.display = "none";
  resetGame();
});
closeWinBtn.addEventListener("click", () => {
  winOverlay.style.display = "none";
});

function cleanName(v, fallback){
  const s = (v || "").trim();
  return s.length ? s.slice(0,18) : fallback;
}

function lockNames(){
  state.namesLocked = true;
  nameAInput.disabled = true;
  nameBInput.disabled = true;
  nameNote.textContent = "تم قفل الأسماء بعد بدء اللعبة.";
}

function setStatus(line, hint){
  statusLine.textContent = line;
  hintLine.textContent = hint;
}

function showWinner(w){
  const winnerName = (w==="A") ? state.nameA : state.nameB;
  winTitle.textContent = `🎉 الفائز: ${winnerName}`;
  winText.textContent = "انتهت المباراة. يمكنك إعادة اللعب الآن.";
  winOverlay.style.display = "flex";
}

function resetGame(){
  // names read before reset (if not locked)
  state.nameA = cleanName(nameAInput.value, "Player A");
  state.nameB = cleanName(nameBInput.value, state.vsAi ? "AI" : "Player B");

  state.board = initBoard();
  state.phase="placement";
  state.turnPlace="A";
  state.remaining={A:12,B:12};
  state.placeCountInTurn=0;

  state.turnMove="B";
  state.selected=null;
  state.chainAllowed=false;
  state.lastMoverPos=null;

  state.capturedFrom={A:0,B:0};
  state.lastMove=null;
  state.lastCaptured=null;

  state.lock=false;

  // unlock names on reset
  state.namesLocked = false;
  nameAInput.disabled = false;
  nameBInput.disabled = false;
  nameNote.textContent = "يمكنك تعديل الأسماء قبل بداية اللعبة. بعد أول رص سيتم قفلها.";

  // default nameB for AI
  if(state.vsAi && !nameBInput.value.trim()) nameBInput.value = "AI";

  winOverlay.style.display="none";

  setStatus(`ابدأ الرص: دور ${state.nameA} (A) — حجرين.`, "ممنوع الرص في C3 (المربع X).");
  chainActions.style.display="none";
  render(true);
}

function endTurn(){
  const w = checkWinner();
  if(w){ showWinner(w); return; }

  state.turnMove = other(state.turnMove);

  if(state.vsAi && state.turnMove==="B"){
    setStatus(`دور ${state.nameB} (B) — الذكاء الاصطناعي...`, "الذكاء الاصطناعي يتحرك الآن.");
    aiPlayTurn();
  }else{
    // Pass & Play hint
    const nm = (state.turnMove==="A") ? state.nameA : state.nameB;
    setStatus(`دور ${nm} (${state.turnMove}) للحركة.`, `مرر الجوال إلى ${nm} ثم اضغط حجرًا ثم خانة فاضية.`);
  }
}

function handleCellClick(r,c){
  if(state.lock) return;

  // -------- Placement --------
  if(state.phase==="placement"){
    // lock names at first real action
    if(!state.namesLocked) lockNames();

    const p = state.turnPlace;

    // if vs AI: user only places A
    if(state.vsAi && p==="B"){
      setStatus(`${state.nameB} يرص تلقائيًا.`, `الآن دور ${state.nameA} فقط.`);
      return;
    }

    if(!validPlacement(r,c)){
      setStatus("غير مسموح.", "الخانة مشغولة أو C3.");
      return;
    }

    state.board[r][c]=p;
    state.remaining[p]--;
    state.placeCountInTurn++;

    if(state.placeCountInTurn<2){
      const nm = (p==="A") ? state.nameA : state.nameB;
      setStatus(`${nm} (${p}) وضع حجر 1.`, "ضع الحجر الثاني.");
      render(true);
      return;
    }

    // end placing turn
    state.placeCountInTurn=0;
    state.turnPlace = other(p);

    if(state.vsAi && state.turnPlace==="B"){
      aiPlaceTwo();
      state.turnPlace="A";
      setStatus(`${state.nameB} (B) رص حجرين تلقائيًا.`, `الآن دور ${state.nameA} يرص حجرين.`);
    }else{
      const nm = (state.turnPlace==="A") ? state.nameA : state.nameB;
      setStatus(`الآن دور ${nm} (${state.turnPlace}) للرّص.`, "ضع حجرين.");
    }

    // placement complete?
    if(state.remaining.A===0 && state.remaining.B===0){
      state.phase="movement";
      state.selected=null;
      state.chainAllowed=false;
      state.lastMoverPos=null;
      state.turnMove="B";

      if(state.vsAi){
        setStatus("اكتمل الرص. B يبدأ الحركة.", "الذكاء الاصطناعي سيتحرك الآن.");
        render(true);
        aiPlayTurn(); // start immediately
      }else{
        setStatus("اكتمل الرص. B يبدأ الحركة.", `مرر الجوال إلى ${state.nameB} ثم ابدأ الحركة.`);
        render(true);
      }
      return;
    }

    render(true);
    return;
  }

  // -------- Movement --------
  const player = state.turnMove;

  // block clicks if B is AI's turn
  if(state.vsAi && player==="B"){
    setStatus("دور الذكاء الاصطناعي.", "انتظر حركة الخصم.");
    return;
  }

  // Chain mode
  if(state.chainAllowed){
    const must = state.lastMoverPos;

    if(!state.selected){
      // must select same piece
      if(!(r===must[0] && c===must[1])){
        setStatus("وضع السلسلة.", `لازم تتحرك بنفس الحجر في ${rcToLabel(...must)}.`);
        return;
      }
      state.selected=[r,c];
      setStatus("تم اختيار الحجر للسلسلة.", "الآن اختر الوجهة (لازم أكل).");
      render(true);
      return;
    }else{
      const frm = state.selected;
      const to = [r,c];

      if(state.board[r][c]!==EMPTY){
        setStatus("الوجهة لازم تكون فاضية.", "اختر خانة فاضية.");
        return;
      }

      const legal = legalMovesFromPiece(player, frm).map(m => m[1].join(","));
      if(!legal.includes(to.join(","))){
        setStatus("حركة غير صحيحة.", "الحركة خطوة واحدة فقط.");
        return;
      }

      const caps = capturingMovesFromPiece(player, frm);
      const capTos = new Set(caps.map(x=>x[1].join(",")));
      if(!capTos.has(to.join(","))){
        setStatus("السلسلة لازم تكون بأكل.", "اختر وجهة تؤدي لأكل.");
        return;
      }

      const cap = doMove(player, frm, to);
      state.capturedFrom[other(player)] += cap;
      state.lastMove = {player, frm, to, cap};

      state.selected=null;
      state.lastMoverPos = to;

      render(true);

      // check for next chain
      const nextCaps = capturingMovesFromPiece(player, to);
      if(nextCaps.length){
        state.chainAllowed=true;
        chainActions.style.display="flex";
        setStatus(`تم تكسير ${cap} (سلسلة متاحة)`, `يمكنك المتابعة من ${rcToLabel(...to)} أو إنهاء الدور.`);
      }else{
        state.chainAllowed=false;
        state.lastMoverPos=null;
        chainActions.style.display="none";
        endTurn();
      }
      return;
    }
  }

  // Normal move: select piece then destination
  if(!state.selected){
    if(state.board[r][c]!==player){
      const nm = (player==="A") ? state.nameA : state.nameB;
      setStatus("اختار حجرك أولاً.", `الدور الآن: ${nm} (${player})`);
      return;
    }
    state.selected=[r,c];
    setStatus("تم اختيار الحجر.", "الآن اختر خانة فاضية للوجهة.");
    render(true);
    return;
  }else{
    const frm = state.selected;
    const to = [r,c];

    if(state.board[r][c]!==EMPTY){
      setStatus("الوجهة لازم تكون فاضية.", "اختر خانة فاضية.");
      return;
    }

    const legal = legalMovesFromPiece(player, frm).map(m => m[1].join(","));
    if(!legal.includes(to.join(","))){
      setStatus("حركة غير صحيحة.", "الحركة خطوة واحدة فقط.");
      return;
    }

    const cap = doMove(player, frm, to);
    state.capturedFrom[other(player)] += cap;
    state.lastMove = {player, frm, to, cap};

    state.selected=null;

    render(true);

    if(cap>0){
      const nextCaps = capturingMovesFromPiece(player, to);
      if(nextCaps.length){
        state.chainAllowed=true;
        state.lastMoverPos=to;
        chainActions.style.display="flex";
        setStatus(`تم تكسير ${cap} (سلسلة متاحة)`, `يمكنك المتابعة من ${rcToLabel(...to)} أو إنهاء الدور.`);
        return;
      }
    }

    state.chainAllowed=false;
    state.lastMoverPos=null;
    chainActions.style.display="none";
    endTurn();
    return;
  }
}

function render(withPulse=false){
  // compute names (safe)
  state.nameA = cleanName(nameAInput.value, "Player A");
  const bFallback = state.vsAi ? "AI" : "Player B";
  state.nameB = cleanName(nameBInput.value, bFallback);

  // status defaults (only if no winner overlay)
  if(state.phase==="placement"){
    setStatus(
      `مرحلة الرص: دور ${state.turnPlace==="A" ? state.nameA : state.nameB} (${state.turnPlace}) — حجرين`,
      `المتبقي A=${state.remaining.A} | B=${state.remaining.B} | C3 ممنوع رص`
    );
  }else{
    const w = checkWinner();
    if(w){
      showWinner(w);
    }else{
      const nm = (state.turnMove==="A") ? state.nameA : state.nameB;
      const hint = state.vsAi
        ? "اضغط حجرًا ثم خانة فاضية."
        : `مرر الجوال إلى ${nm} ثم اضغط حجرًا ثم خانة فاضية.`;
      setStatus(`مرحلة الحركة: الدور ${nm} (${state.turnMove})`, hint);
    }
  }

  // chain buttons
  chainActions.style.display = (state.phase==="movement" && state.chainAllowed) ? "flex" : "none";

  // bench
  capAEl.textContent = state.capturedFrom.A;
  capBEl.textContent = state.capturedFrom.B;

  dotsA.innerHTML = "";
  dotsB.innerHTML = "";
  for(let i=0;i<Math.min(state.capturedFrom.A, 30); i++){
    const d=document.createElement("div"); d.className="dot A"; dotsA.appendChild(d);
  }
  for(let i=0;i<Math.min(state.capturedFrom.B, 30); i++){
    const d=document.createElement("div"); d.className="dot B"; dotsB.appendChild(d);
  }

  if(state.lastMove){
    const lm = state.lastMove;
    const nm = (lm.player==="A") ? state.nameA : state.nameB;
    lastMoveBox.textContent = `آخر حركة: ${nm} (${lm.player})  ${rcToLabel(...lm.frm)} → ${rcToLabel(...lm.to)} | تكسير: ${lm.cap}`;
  }else{
    lastMoveBox.textContent = "آخر حركة: —";
  }

  // board
  boardEl.innerHTML = "";
  const lastFrom = state.lastMove ? state.lastMove.frm.join(",") : null;
  const lastTo = state.lastMove ? state.lastMove.to.join(",") : null;
  const lastPlayer = state.lastMove ? state.lastMove.player : null;

  // captured animation set
  const capSet = new Set();
  const capVictim = state.lastCaptured ? state.lastCaptured.victim : null;
  if(state.lastCaptured){
    for(const p of state.lastCaptured.positions){
      capSet.add(p.join(","));
    }
  }

  for(let r=0;r<SIZE;r++){
    for(let c=0;c<SIZE;c++){
      const cell = document.createElement("div");
      cell.className="cell";
      const key = `${r},${c}`;

      if(isCenter(r,c) && state.board[r][c]===EMPTY){
        cell.classList.add("centerEmpty");
      }

      if(state.selected && state.selected[0]===r && state.selected[1]===c){
        cell.classList.add("selected");
      }

      if(lastFrom === key && lastPlayer){
        cell.classList.add("lastFrom", lastPlayer);
      }
      if(lastTo === key && lastPlayer){
        cell.classList.add("lastTo", lastPlayer);
      }

      if(withPulse && (lastFrom===key || lastTo===key)){
        cell.classList.add("pulse");
      }

      const v = state.board[r][c];

      // normal piece
      if(v==="A" || v==="B"){
        const p = document.createElement("div");
        p.className = `piece ${v}`;
        p.textContent = v;
        cell.appendChild(p);
      }

      // capture animation ghost (piece already removed in board, but we show shatter)
      if(v===EMPTY && capSet.has(key) && (capVictim==="A" || capVictim==="B")){
        const ghost = document.createElement("div");
        ghost.className = `piece ${capVictim} shatter`;
        ghost.textContent = capVictim;
        cell.appendChild(ghost);
      }

      cell.addEventListener("click", () => handleCellClick(r,c));
      boardEl.appendChild(cell);
    }
  }
}

function shuffle(a){
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
}

function sleep(ms){ return new Promise(res=>setTimeout(res, ms)); }

// boot defaults
vsAiEl.checked = true;
nameAInput.value = "";
nameBInput.value = "AI";
resetGame();
