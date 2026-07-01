// Football Hub — Ballon d'Or Predictions & Matchday Chat

const footballRef = firebase.database().ref('football');

function renderBallonDor(container) {
  container.appendChild(el('div', { class: 'football-section-header' }, '🏆 Ballon d\'Or 2025 — Pick Your Top 3'));
  container.appendChild(el('p', { style: 'color:var(--text-secondary); font-size:13px; margin-bottom:16px;' },
    'Select up to 3 players you think will win. Your picks are shared with all mess members in real-time.'));

  // Load predictions from Firebase
  footballRef.child('ballonDor').once('value', snap => {
    const allPreds = snap.val() || {};
    const myPicks = allPreds[currentUser] || [];

    // My prediction card
    if (myPicks.length > 0) {
      const myCard = el('div', { class: 'my-prediction-card' });
      const left = el('div', {});
      left.appendChild(el('div', { style: 'font-size:12px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;' }, '🎯 YOUR PREDICTIONS'));
      const chips = el('div', { class: 'my-prediction-picks' });
      myPicks.forEach((p, i) => chips.appendChild(el('span', { class: 'my-prediction-chip' }, `${i+1}. ${p}`)));
      left.appendChild(chips);
      myCard.appendChild(left);

      // WhatsApp share
      const shareMsg = encodeURIComponent(`⚽ My Ballon d'Or 2025 Predictions:\n🥇 ${myPicks[0] || '-'}\n🥈 ${myPicks[1] || '-'}\n🥉 ${myPicks[2] || '-'}\n\n— ${currentUser} from Mess Manager`);
      myCard.appendChild(el('button', { class: 'share-prediction-btn', onclick: () => window.open(`https://wa.me/?text=${shareMsg}`, '_blank') }, '📤 Share on WhatsApp'));
      container.appendChild(myCard);
    }

    // Candidate grid
    const grid = el('div', { class: 'ballon-dor-grid' });
    // Count all votes
    const voteCounts = {};
    BALLON_CANDIDATES.forEach(c => voteCounts[c.name] = 0);
    Object.values(allPreds).forEach(picks => {
      if (Array.isArray(picks)) picks.forEach(p => { if (voteCounts[p] !== undefined) voteCounts[p]++; });
    });

    BALLON_CANDIDATES.forEach(c => {
      const isSelected = myPicks.includes(c.name);
      const rank = isSelected ? myPicks.indexOf(c.name) + 1 : 0;
      const card = el('div', { class: `candidate-card ${isSelected ? 'selected' : ''}` });

      card.appendChild(el('div', { class: 'candidate-rank' }, String(rank)));
      card.appendChild(el('div', { class: 'candidate-avatar' }, c.emoji));
      card.appendChild(el('div', { class: 'candidate-name' }, c.name));
      card.appendChild(el('div', { class: 'candidate-club' }, c.club));
      if (voteCounts[c.name] > 0) {
        card.appendChild(el('div', { class: 'candidate-votes' }, `${voteCounts[c.name]} vote${voteCounts[c.name]>1?'s':''}`));
      }

      card.addEventListener('click', () => {
        let picks = [...myPicks];
        const idx = picks.indexOf(c.name);
        if (idx >= 0) { picks.splice(idx, 1); }
        else if (picks.length < 3) { picks.push(c.name); }
        else { showToast('Max 3 picks! Remove one first.', 'error'); return; }
        footballRef.child(`ballonDor/${currentUser}`).set(picks);
        showToast(idx >= 0 ? `Removed ${c.name}` : `Selected ${c.name} (#${picks.length})`, 'success');
        renderFootball();
      });
      grid.appendChild(card);
    });
    container.appendChild(grid);

    // Leaderboard
    container.appendChild(el('div', { class: 'football-section-header' }, '📊 Vote Leaderboard'));
    const leaderboard = el('div', { class: 'table-wrap prediction-leaderboard' });
    const sorted = Object.entries(voteCounts).sort((a,b) => b[1]-a[1]).filter(([,v]) => v > 0);
    const maxVotes = sorted.length > 0 ? sorted[0][1] : 1;

    if (sorted.length === 0) {
      leaderboard.appendChild(el('div', { style: 'padding:20px; text-align:center; color:var(--text-muted)' }, 'No votes yet. Be the first!'));
    } else {
      sorted.forEach(([name, votes], i) => {
        const c = BALLON_CANDIDATES.find(x => x.name === name);
        const row = el('div', { class: 'prediction-row' });
        const rankCls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
        row.appendChild(el('span', { class: `prediction-rank-num ${rankCls}` }, `#${i+1}`));
        const info = el('div', { class: 'prediction-player-info' });
        info.appendChild(el('div', { class: 'prediction-player-name' }, `${c?.emoji||''} ${name}`));
        info.appendChild(el('div', { class: 'prediction-player-club' }, c?.club||''));
        row.appendChild(info);
        const bar = el('div', { class: 'prediction-vote-bar' });
        bar.appendChild(el('div', { class: 'prediction-vote-fill', style: `width:${(votes/maxVotes)*100}%` }));
        row.appendChild(bar);
        row.appendChild(el('span', { class: 'prediction-vote-count' }, `${votes}`));
        leaderboard.appendChild(row);
      });
    }
    container.appendChild(leaderboard);

    // All member predictions
    container.appendChild(el('div', { class: 'football-section-header' }, '👥 Member Predictions'));
    const membersWrap = el('div', { class: 'table-wrap member-predictions-wrap' });
    const members = state.members || DEFAULT_MEMBERS;
    let hasPreds = false;
    members.forEach((m, mi) => {
      const picks = allPreds[m];
      if (!picks || !picks.length) return;
      hasPreds = true;
      const row = el('div', { class: 'member-pred-row' });
      row.appendChild(el('div', { style: 'display:flex; align-items:center; gap:8px;' }, avatar(m, mi), el('span', { class: 'member-pred-name' }, m)));
      const chipsWrap = el('div', { class: 'member-pred-picks' });
      picks.forEach((p, i) => chipsWrap.appendChild(el('span', { class: 'my-prediction-chip' }, `${['🥇','🥈','🥉'][i]} ${p}`)));
      row.appendChild(chipsWrap);
      membersWrap.appendChild(row);
    });
    if (!hasPreds) membersWrap.appendChild(el('div', { style: 'padding:20px; text-align:center; color:var(--text-muted)' }, 'No members have voted yet.'));
    container.appendChild(membersWrap);
  });
}

// ── Matchday Chat ──
function renderMatchdayChat(container) {
  const chatContainer = el('div', { class: 'matchday-chat-container' });

  // Header
  const header = el('div', { class: 'matchday-chat-header' });
  header.appendChild(el('span', { style: 'font-size:18px' }, '⚽'));
  header.appendChild(el('div', { class: 'matchday-chat-live-info', html: '<strong>Matchday Chat</strong> — Discuss live matches with your mess mates!' }));
  chatContainer.appendChild(header);

  // Messages
  const messagesWrap = el('div', { class: 'matchday-chat-messages' });
  chatContainer.appendChild(messagesWrap);

  function renderMsgs(messages) {
    messagesWrap.innerHTML = '';
    if (!messages || messages.length === 0) {
      messagesWrap.appendChild(el('div', { style: 'color:var(--text-muted); text-align:center; padding:40px;' },
        '⚽ No messages yet. Start the matchday discussion!'));
      return;
    }
    messages.forEach(msg => {
      const isSelf = msg.sender === currentUser;
      const mDiv = el('div', { class: `matchday-msg ${isSelf ? 'self' : 'other'}` });
      mDiv.appendChild(el('div', { class: 'matchday-msg-bubble' }, msg.text));
      mDiv.appendChild(el('div', { class: 'matchday-msg-meta' }, isSelf ? msg.time : `${msg.sender} • ${msg.time}`));
      messagesWrap.appendChild(mDiv);
    });
    messagesWrap.scrollTop = messagesWrap.scrollHeight;
  }

  // Quick reactions
  const quickBar = el('div', { class: 'matchday-quick-reactions' });
  ['⚽ GOAL!', '🔥 What a play!', '😱 No way!', '🟥 RED CARD!', '🟨 Yellow!', '💪 Let\'s go!', '😂 Lol', '👏 Great save!'].forEach(txt => {
    quickBar.appendChild(el('button', { class: 'matchday-quick-btn', onclick: () => {
      sendMatchdayMsg(txt);
    }}, txt));
  });
  chatContainer.appendChild(quickBar);

  // Input
  const inputArea = el('div', { class: 'matchday-chat-input' });
  const textInp = el('input', { type: 'text', placeholder: 'Type your message...' });
  const sendBtn = el('button', {}, 'Send');

  function sendMatchdayMsg(text) {
    if (!text.trim()) return;
    const now = new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka", month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
    footballRef.child('matchChat').once('value', snap => {
      let msgs = snap.val() || [];
      if (!Array.isArray(msgs)) msgs = Object.values(msgs);
      msgs.push({ id: Date.now(), sender: currentUser, text: text.trim(), time: now });
      if (msgs.length > 300) msgs.shift();
      footballRef.child('matchChat').set(msgs);
    });
  }

  sendBtn.addEventListener('click', () => { sendMatchdayMsg(textInp.value); textInp.value = ''; });
  textInp.addEventListener('keydown', e => { if (e.key === 'Enter') { sendMatchdayMsg(textInp.value); textInp.value = ''; } });
  inputArea.appendChild(textInp);
  inputArea.appendChild(sendBtn);
  chatContainer.appendChild(inputArea);
  container.appendChild(chatContainer);

  // Listen for real-time updates
  footballRef.child('matchChat').on('value', snap => {
    let msgs = snap.val() || [];
    if (!Array.isArray(msgs)) msgs = Object.values(msgs);
    renderMsgs(msgs);
  });
}
