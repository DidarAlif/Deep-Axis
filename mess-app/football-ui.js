// Football Hub — Render Functions (Part 1: Live Scores & Fixtures)

let _fbSubTab = 'live';
let _fbLeague = 39;
let _fbFixtureSearch = '';
let _fbLiveInterval = null;

function renderFootball() {
  const container = document.querySelector('#tab-football');
  if (!container) return;
  container.innerHTML = '';

  container.appendChild(el('div', { class: 'page-header' },
    el('div', { style: 'display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 12px;' },
      el('div', {},
        el('h2', {}, '⚽ Football Hub'),
        el('p', {}, 'Live scores, fixtures, predictions & matchday chat')
      ),
      el('a', {
        href: 'https://master.deepaxis-tv.pages.dev',
        target: '_blank',
        class: 'watch-tv-btn',
        style: 'display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; padding: 8px 14px; background: linear-gradient(135deg, #4f46e5 0%, #3730a3 100%); color: white; border-radius: 8px; text-decoration: none; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3); transition: transform 0.2s;'
      }, '📺 DeepAxis TV')
    )
  ));

  // Sub-tabs
  const tabs = el('div', { class: 'football-sub-tabs' });
  [['live','⚡ Live & Next'],['fixtures','📅 Fixtures'],['ballon','🏆 Ballon d\'Or'],['mchat','💬 Match Chat']].forEach(([k,label]) => {
    const btn = el('button', { class: `football-sub-tab ${_fbSubTab===k?'active':''}`, onclick: () => {
      _fbSubTab = k; renderFootball();
    }}, label);
    tabs.appendChild(btn);
  });
  container.appendChild(tabs);

  const content = el('div', { class: 'football-sub-content active' });
  container.appendChild(content);

  if (_fbSubTab === 'live') renderFootballLive(content);
  else if (_fbSubTab === 'fixtures') renderFootballFixtures(content);
  else if (_fbSubTab === 'ballon') renderBallonDor(content);
  else if (_fbSubTab === 'mchat') renderMatchdayChat(content);
}

// ── Matchday Notification Check ──
function checkMatchdayNotifs(matches) {
  if (!matches || !matches.length) return;
  const now = Date.now();
  matches.forEach(m => {
    const kickoff = new Date(m.fixture?.date).getTime();
    const diff = kickoff - now;
    if (diff > 0 && diff < 30*60*1000) {
      const h = m.teams?.home?.name || '?';
      const a = m.teams?.away?.name || '?';
      const notifKey = 'fbnotif_' + m.fixture.id;
      if (!sessionStorage.getItem(notifKey)) {
        sessionStorage.setItem(notifKey, '1');
        showToast(`⚽ Starting soon: ${h} vs ${a}`, 'info');
      }
    }
  });
  // Show live dot
  const dot = document.getElementById('footballLiveDot');
  const hasLive = matches.some(m => {
    const s = m.fixture?.status?.short;
    return s === '1H' || s === '2H' || s === 'HT' || s === 'ET' || s === 'LIVE';
  });
  if (dot) dot.style.display = hasLive ? 'inline-block' : 'none';
}

function buildMatchCard(m) {
  const fix = m.fixture || {};
  const teams = m.teams || {};
  const goals = m.goals || {};
  const status = fix.status?.short || 'NS';
  const isLive = ['1H','2H','HT','ET','LIVE','P'].includes(status);
  const isDone = ['FT','AET','PEN'].includes(status);
  const leagueName = m.league?.name || '';

  const card = el('div', { class: `match-card ${isLive ? 'live' : ''}` });

  // Header
  const header = el('div', { class: 'match-card-header' });
  header.appendChild(el('span', { class: 'match-league-badge' }, leagueName));
  const stClass = isLive ? 'status-live' : isDone ? 'status-ft' : 'status-ns';
  const stText = isLive ? (fix.status?.elapsed ? fix.status.elapsed + '\'' : 'LIVE') : isDone ? status : '';
  if (stText) header.appendChild(el('span', { class: `match-status ${stClass}` }, stText));
  card.appendChild(header);

  // Teams & Score
  const teamsRow = el('div', { class: 'match-teams' });
  const homeLogo = el('img', { class: 'match-team-logo', src: teams.home?.logo || '', alt: '', onerror: function(){ this.style.display='none'; } });
  const awayLogo = el('img', { class: 'match-team-logo', src: teams.away?.logo || '', alt: '', onerror: function(){ this.style.display='none'; } });

  teamsRow.appendChild(el('div', { class: 'match-team' }, homeLogo, el('div', { class: 'match-team-name' }, teams.home?.name || '?')));

  if (isLive || isDone) {
    const score = el('div', { class: 'match-score' },
      el('span', { class: 'match-score-num' }, String(goals.home ?? 0)),
      el('span', { class: 'match-score-divider' }, '—'),
      el('span', { class: 'match-score-num' }, String(goals.away ?? 0))
    );
    teamsRow.appendChild(score);
  } else {
    const dt = new Date(fix.date);
    const timeStr = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' });
    teamsRow.appendChild(el('div', { class: 'match-time-display' }, timeStr));
  }

  teamsRow.appendChild(el('div', { class: 'match-team' }, awayLogo, el('div', { class: 'match-team-name' }, teams.away?.name || '?')));
  card.appendChild(teamsRow);

  // Footer
  const footer = el('div', { class: 'match-card-footer' });
  const dt = new Date(fix.date);
  footer.appendChild(el('span', {}, dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Dhaka' })));
  if (isLive) {
    footer.appendChild(el('a', {
      href: 'https://master.deepaxis-tv.pages.dev',
      target: '_blank',
      style: 'font-size: 10px; font-weight: 700; padding: 3px 8px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; border-radius: 4px; text-decoration: none; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 6px rgba(239, 68, 68, 0.4); border: 1px solid rgba(255,255,255,0.1);'
    }, '📺 Watch Live'));
  } else if (!isDone) {
    const diff = dt.getTime() - Date.now();
    if (diff > 0) {
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      footer.appendChild(el('span', { class: 'match-countdown' }, hrs > 24 ? `${Math.floor(hrs/24)}d ${hrs%24}h` : `${hrs}h ${mins}m`));
    }
  }
  card.appendChild(footer);
  return card;
}

async function renderFootballLive(container) {
  const apiKey = FootballAPI._getKey();
  if (!apiKey) { renderApiSetup(container); return; }

  container.appendChild(el('div', { class: 'football-loading' }, el('div',{class:'shimmer-card'}), el('div',{class:'shimmer-card'})));

  // Fetch live + next for all leagues
  const [live, ...nexts] = await Promise.all([
    FootballAPI.getLive(),
    ...FB_LEAGUES.map(l => FootballAPI.getNextMatches(l.id, l.season, 5))
  ]);

  container.innerHTML = '';

  // Matchday notifications
  const allUpcoming = nexts.flat().filter(Boolean);
  checkMatchdayNotifs([...(live||[]), ...allUpcoming]);

  // Live section
  const relevantLive = (live || []).filter(m => FB_LEAGUES.some(l => l.id === m.league?.id));
  if (relevantLive.length > 0) {
    container.appendChild(el('div', { class: 'matchday-notif-card' },
      el('span', { class: 'notif-icon' }, '🔴'),
      el('div', { class: 'notif-text', html: `<strong>${relevantLive.length} match${relevantLive.length>1?'es':''} LIVE right now!</strong> Auto-refreshing every 60s.` })
    ));
    container.appendChild(el('div', { class: 'football-section-header' }, '🔴 Live Now'));
    const grid = el('div', { class: 'match-cards-grid' });
    relevantLive.forEach(m => grid.appendChild(buildMatchCard(m)));
    container.appendChild(grid);
  }

  // Next matches per league
  FB_LEAGUES.forEach((league, li) => {
    const matches = nexts[li] || [];
    if (matches.length === 0) return;
    container.appendChild(el('div', { class: 'football-section-header' }, `${league.flag} ${league.name} — Upcoming`));
    const grid = el('div', { class: 'match-cards-grid' });
    matches.slice(0, 5).forEach(m => grid.appendChild(buildMatchCard(m)));
    container.appendChild(grid);
  });

  if (relevantLive.length === 0 && allUpcoming.length === 0) {
    container.appendChild(el('div', { class: 'football-empty' }, el('div',{class:'football-empty-icon'},'⚽'), 'No upcoming matches found. Check back later!'));
  }

  // Auto-refresh if live
  if (_fbLiveInterval) clearInterval(_fbLiveInterval);
  if (relevantLive.length > 0) {
    _fbLiveInterval = setInterval(() => {
      if (_fbSubTab === 'live') { FootballAPI._cache = {}; renderFootball(); }
      else clearInterval(_fbLiveInterval);
    }, 60000);
  }
}

async function renderFootballFixtures(container) {
  const apiKey = FootballAPI._getKey();
  if (!apiKey) { renderApiSetup(container); return; }

  // League tabs
  const leagueTabs = el('div', { class: 'league-tabs' });
  FB_LEAGUES.forEach(l => {
    leagueTabs.appendChild(el('button', {
      class: `league-tab ${_fbLeague===l.id?'active':''}`,
      onclick: () => { _fbLeague = l.id; _fbFixtureSearch = ''; renderFootball(); }
    }, `${l.flag} ${l.name}`));
  });
  container.appendChild(leagueTabs);

  // Search
  const search = el('input', { class: 'fixture-search', type: 'text', placeholder: '🔍 Search teams...', value: _fbFixtureSearch });
  search.addEventListener('input', e => { _fbFixtureSearch = e.target.value; renderFixtureList(listWrap, league); });
  container.appendChild(search);

  const league = FB_LEAGUES.find(l => l.id === _fbLeague);
  const listWrap = el('div', { class: 'table-wrap' });
  listWrap.appendChild(el('div', { class: 'football-loading' }, el('div',{class:'shimmer-card'})));
  container.appendChild(listWrap);

  const fixtures = await FootballAPI.getFixtures(league.id, league.season);
  renderFixtureList(listWrap, league, fixtures);
}

function renderFixtureList(wrap, league, fixtures) {
  wrap.innerHTML = '';
  if (!fixtures || fixtures.length === 0) {
    wrap.appendChild(el('div', { class: 'football-empty' }, el('div',{class:'football-empty-icon'},'📅'), `No fixtures available for ${league.name} yet.`));
    return;
  }

  let filtered = fixtures;
  if (_fbFixtureSearch.trim()) {
    const q = _fbFixtureSearch.toLowerCase();
    filtered = fixtures.filter(m => (m.teams?.home?.name||'').toLowerCase().includes(q) || (m.teams?.away?.name||'').toLowerCase().includes(q));
  }

  // Group by round
  const groups = {};
  filtered.forEach(m => {
    const round = m.league?.round || 'TBD';
    if (!groups[round]) groups[round] = [];
    groups[round].push(m);
  });

  const scroll = el('div', { class: 'table-scroll', style: 'max-height:600px' });
  Object.keys(groups).forEach(round => {
    scroll.appendChild(el('div', { class: 'fixture-round-header' }, round));
    groups[round].forEach(m => {
      const fix = m.fixture || {};
      const status = fix.status?.short || 'NS';
      const isDone = ['FT','AET','PEN'].includes(status);
      const dt = new Date(fix.date);
      const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Dhaka' });

      const row = el('div', { class: 'fixture-item' });
      row.appendChild(el('span', { class: 'fixture-date' }, dateStr));

      const teamsRow = el('div', { class: 'fixture-teams-row' });
      teamsRow.appendChild(el('span', { class: 'fixture-team-name home' }, m.teams?.home?.name || '?'));

      if (isDone) {
        teamsRow.appendChild(el('span', { class: 'fixture-score-box' }, `${m.goals?.home ?? 0} - ${m.goals?.away ?? 0}`));
      } else {
        const time = dt.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZone:'Asia/Dhaka' });
        teamsRow.appendChild(el('span', { class: 'fixture-score-box pending' }, time));
      }
      teamsRow.appendChild(el('span', { class: 'fixture-team-name away' }, m.teams?.away?.name || '?'));
      row.appendChild(teamsRow);
      scroll.appendChild(row);
    });
  });
  wrap.appendChild(el('div', { class: 'table-title' }, `📅 ${league.flag} ${league.name} — ${filtered.length} fixtures`));
  wrap.appendChild(scroll);
}

function renderApiSetup(container) {
  const card = el('div', { class: 'api-setup-card' });
  card.appendChild(el('h3', {}, '🔑 API Key Required'));
  card.appendChild(el('p', {}, 'Get a free API key from api-football.com (100 requests/day, no credit card). Paste it below:'));
  const inp = el('input', { type: 'text', placeholder: 'Enter your API-Football key...' });
  card.appendChild(inp);
  card.appendChild(el('br'));
  card.appendChild(el('button', { onclick: () => {
    const k = inp.value.trim();
    if (k) { localStorage.setItem('footballApiKey', k); showToast('API key saved!', 'success'); renderFootball(); }
  }}, '💾 Save Key'));
  container.appendChild(card);
}
