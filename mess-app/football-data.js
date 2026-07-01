// Football Hub — Static Data & API Layer
const FB_LEAGUES = [
  { id: 39, name: 'Premier League', flag: '🏴\u200d󠁧󠁢󠁥󠁮󠁧󠁿', season: 2026 },
  { id: 140, name: 'La Liga', flag: '🇪🇸', season: 2026 },
  { id: 78, name: 'Bundesliga', flag: '🇩🇪', season: 2026 },
  { id: 1, name: 'World Cup', flag: '🌍', season: 2026 }
];

const BALLON_CANDIDATES = [
  { name: 'Vinícius Jr.', club: 'Real Madrid', emoji: '🇧🇷' },
  { name: 'Erling Haaland', club: 'Man City', emoji: '🇳🇴' },
  { name: 'Kylian Mbappé', club: 'Real Madrid', emoji: '🇫🇷' },
  { name: 'Jude Bellingham', club: 'Real Madrid', emoji: '🏴\u200d󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'Rodri', club: 'Man City', emoji: '🇪🇸' },
  { name: 'Lamine Yamal', club: 'Barcelona', emoji: '🇪🇸' },
  { name: 'Mohamed Salah', club: 'Liverpool', emoji: '🇪🇬' },
  { name: 'Florian Wirtz', club: 'B. Leverkusen', emoji: '🇩🇪' },
  { name: 'Harry Kane', club: 'Bayern Munich', emoji: '🏴\u200d󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'Bukayo Saka', club: 'Arsenal', emoji: '🏴\u200d󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'Cole Palmer', club: 'Chelsea', emoji: '🏴\u200d󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'Pedri', club: 'Barcelona', emoji: '🇪🇸' },
  { name: 'Phil Foden', club: 'Man City', emoji: '🏴\u200d󠁧󠁢󠁥󠁮󠁧󠁿' },
  { name: 'Lionel Messi', club: 'Inter Miami', emoji: '🇦🇷' },
  { name: 'Jamal Musiala', club: 'Bayern Munich', emoji: '🇩🇪' },
  { name: 'Martin Ødegaard', club: 'Arsenal', emoji: '🇳🇴' },
  { name: 'Raphinha', club: 'Barcelona', emoji: '🇧🇷' },
  { name: 'Dani Olmo', club: 'Barcelona', emoji: '🇪🇸' },
  { name: 'Kevin De Bruyne', club: 'Man City', emoji: '🇧🇪' },
  { name: 'Ademola Lookman', club: 'Atalanta', emoji: '🇳🇬' }
];

// Compact team list mapping for programmatic mock data generation
const MOCK_LEAGUE_TEAMS = {
  1: [ // World Cup
    { name: "USA", logo: 2384 }, { name: "Morocco", logo: 28 },
    { name: "Canada", logo: 2387 }, { name: "Togo", logo: 1515 },
    { name: "Mexico", logo: 2382 }, { name: "South Africa", logo: 1507 },
    { name: "Argentina", logo: 26 }, { name: "Sweden", logo: 13 },
    { name: "England", logo: 10 }, { name: "Japan", logo: 1157 },
    { name: "Spain", logo: 9 }, { name: "Australia", logo: 20 },
    { name: "Germany", logo: 25 }, { name: "South Korea", logo: 771 },
    { name: "France", logo: 2 }, { name: "Egypt", logo: 29 },
    { name: "Brazil", logo: 6 }, { name: "Colombia", logo: 27 },
    { name: "Portugal", logo: 30 }, { name: "Italy", logo: 768 }
  ],
  39: [ // Premier League
    { name: "Arsenal", logo: 42 }, { name: "Chelsea", logo: 49 },
    { name: "Liverpool", logo: 40 }, { name: "Manchester City", logo: 50 },
    { name: "Manchester United", logo: 33 }, { name: "Tottenham", logo: 47 },
    { name: "Newcastle", logo: 34 }, { name: "Aston Villa", logo: 66 },
    { name: "West Ham", logo: 48 }, { name: "Leicester", logo: 46 }
  ],
  140: [ // La Liga
    { name: "Real Madrid", logo: 541 }, { name: "Barcelona", logo: 529 },
    { name: "Atletico Madrid", logo: 530 }, { name: "Real Betis", logo: 543 },
    { name: "Sevilla", logo: 536 }, { name: "Valencia", logo: 532 },
    { name: "Villarreal", logo: 533 }, { name: "Real Sociedad", logo: 548 }
  ],
  78: [ // Bundesliga
    { name: "Bayern Munich", logo: 157 }, { name: "Borussia Dortmund", logo: 165 },
    { name: "Bayer Leverkusen", logo: 168 }, { name: "RB Leipzig", logo: 173 },
    { name: "Eintracht Frankfurt", logo: 169 }, { name: "Wolfsburg", logo: 161 }
  ]
};

function _generateMockLiveMatches() {
  const now = Date.now();
  const elapsed = Math.floor((now % (95 * 60 * 1000)) / (60 * 1000)); // cycles 0-95 minutes
  const status = elapsed < 45 ? '1H' : elapsed < 60 ? 'HT' : elapsed < 105 ? '2H' : 'FT';
  const displayElapsed = elapsed < 45 ? elapsed : elapsed < 60 ? 45 : elapsed < 105 ? elapsed - 15 : 90;
  const homeGoals = Math.min(3, Math.floor(displayElapsed / 25));
  const awayGoals = Math.min(3, Math.floor(displayElapsed / 35));

  return [
    {
      fixture: {
        id: 999991,
        referee: "Pierluigi Collina",
        timezone: "UTC",
        date: new Date(now - elapsed * 60 * 1000).toISOString(),
        timestamp: Math.floor((now - elapsed * 60 * 1000) / 1000),
        status: {
          long: status === 'HT' ? 'Halftime' : status === 'FT' ? 'Finished' : 'In Progress',
          short: status,
          elapsed: displayElapsed
        }
      },
      league: {
        id: 1,
        name: "World Cup",
        country: "World",
        logo: "https://media.api-sports.io/football/leagues/1.png",
        flag: null,
        season: 2026,
        round: "Group Stage - A"
      },
      teams: {
        home: {
          id: 2382,
          name: "Mexico",
          logo: "https://media.api-sports.io/football/teams/2382.png",
          winner: homeGoals > awayGoals
        },
        away: {
          id: 1507,
          name: "South Africa",
          logo: "https://media.api-sports.io/football/teams/1507.png",
          winner: awayGoals > homeGoals
        }
      },
      goals: {
        home: homeGoals,
        away: awayGoals
      }
    },
    {
      fixture: {
        id: 999992,
        timezone: "UTC",
        date: new Date(now - ((elapsed + 25) % 95) * 60 * 1000).toISOString(),
        timestamp: Math.floor((now - ((elapsed + 25) % 95) * 60 * 1000) / 1000),
        status: {
          long: 'In Progress',
          short: '1H',
          elapsed: (elapsed + 25) % 45
        }
      },
      league: {
        id: 39,
        name: "Premier League",
        country: "England",
        logo: "https://media.api-sports.io/football/leagues/39.png",
        flag: "🏴\u200d󠁧󠁢󠁥󠁮󠁧󠁿",
        season: 2026,
        round: "Regular Season - 1"
      },
      teams: {
        home: {
          id: 42,
          name: "Arsenal",
          logo: "https://media.api-sports.io/football/teams/42.png",
          winner: false
        },
        away: {
          id: 49,
          name: "Chelsea",
          logo: "https://media.api-sports.io/football/teams/49.png",
          winner: false
        }
      },
      goals: {
        home: Math.min(2, Math.floor(((elapsed + 25) % 45) / 20)),
        away: Math.min(2, Math.floor(((elapsed + 25) % 45) / 30))
      }
    }
  ];
}

function _generateMockFixtures(leagueId) {
  if (leagueId === 1) {
    const wcMatches = [
      { home: { name: "Mexico", logo: 2382 }, away: { name: "South Africa", logo: 1507 }, date: "2026-06-11T20:30:00Z", round: "Group Stage - A" },
      { home: { name: "South Korea", logo: 771 }, away: { name: "Czechia", logo: 1409 }, date: "2026-06-11T23:30:00Z", round: "Group Stage - A" },
      { home: { name: "Canada", logo: 2387 }, away: { name: "Bosnia and Herzegovina", logo: 1437 }, date: "2026-06-12T20:00:00Z", round: "Group Stage - B" },
      { home: { name: "USA", logo: 2384 }, away: { name: "Paraguay", logo: 25 }, date: "2026-06-12T23:00:00Z", round: "Group Stage - D" },
      { home: { name: "Qatar", logo: 1569 }, away: { name: "Switzerland", logo: 15 }, date: "2026-06-13T17:00:00Z", round: "Group Stage - B" },
      { home: { name: "Brazil", logo: 6 }, away: { name: "Morocco", logo: 28 }, date: "2026-06-13T20:00:00Z", round: "Group Stage - C" },
      { home: { name: "Haiti", logo: 2403 }, away: { name: "Scotland", logo: 11 }, date: "2026-06-13T23:00:00Z", round: "Group Stage - C" },
      { home: { name: "Australia", logo: 20 }, away: { name: "Türkiye", logo: 12 }, date: "2026-06-13T21:00:00Z", round: "Group Stage - D" }
    ];
    let matchId = 10000;
    return wcMatches.map(m => {
      const date = new Date(m.date);
      const now = Date.now();
      const isPast = date.getTime() < now;
      return {
        fixture: {
          id: ++matchId,
          date: m.date,
          status: {
            long: isPast ? "Match Finished" : "Not Started",
            short: isPast ? "FT" : "NS"
          }
        },
        league: {
          id: 1,
          name: "World Cup",
          round: m.round
        },
        teams: {
          home: { name: m.home.name, logo: `https://media.api-sports.io/football/teams/${m.home.logo}.png` },
          away: { name: m.away.name, logo: `https://media.api-sports.io/football/teams/${m.away.logo}.png` }
        },
        goals: {
          home: isPast ? (matchId % 3) : null,
          away: isPast ? (matchId % 2) : null
        }
      };
    });
  }

  const teams = MOCK_LEAGUE_TEAMS[leagueId] || [];
  if (teams.length === 0) return [];
  
  const matches = [];
  let baseDate;
  let roundPrefix;
  let matchesPerDay = 2;
  
  if (leagueId === 39) {
    baseDate = new Date("2026-08-14T19:00:00Z");
    roundPrefix = "Regular Season - ";
  } else if (leagueId === 140) {
    baseDate = new Date("2026-08-21T18:00:00Z");
    roundPrefix = "Regular Season - ";
  } else { // 78
    baseDate = new Date("2026-08-28T18:30:00Z");
    roundPrefix = "Regular Season - ";
  }
  
  let matchId = leagueId * 10000;
  for (let i = 0; i < teams.length; i += 2) {
    if (i + 1 >= teams.length) break;
    const home = teams[i];
    const away = teams[i+1];
    
    const dayOffset = Math.floor(i / (matchesPerDay * 2));
    const hourOffset = (i % (matchesPerDay * 2)) * 3; // space out by 3 hours
    const date = new Date(baseDate.getTime() + dayOffset * 24 * 3600 * 1000 + hourOffset * 3600 * 1000);
    
    const now = Date.now();
    const isPast = date.getTime() < now;
    
    const roundNum = Math.floor(i / 10) + 1;
    const round = leagueId === 1 ? (roundPrefix + String.fromCharCode(65 + Math.floor(i/4))) : (roundPrefix + roundNum);
    
    matches.push({
      fixture: {
        id: ++matchId,
        date: date.toISOString(),
        status: { 
          long: isPast ? "Match Finished" : "Not Started", 
          short: isPast ? "FT" : "NS" 
        }
      },
      league: {
        id: leagueId,
        name: leagueId === 1 ? "World Cup" : leagueId === 39 ? "Premier League" : leagueId === 140 ? "La Liga" : "Bundesliga",
        round: round
      },
      teams: {
        home: { name: home.name, logo: `https://media.api-sports.io/football/teams/${home.logo}.png` },
        away: { name: away.name, logo: `https://media.api-sports.io/football/teams/${away.logo}.png` }
      },
      goals: { 
        home: isPast ? (matchId % 3) : null, 
        away: isPast ? (matchId % 2) : null 
      }
    });
  }
  return matches;
}

const FootballAPI = {
  _cache: {},
  _getKey() {
    return localStorage.getItem('footballApiKey') || 'efe91a504751dcc3ee5a67d614b44438';
  },
  getMockData(endpoint) {
    if (endpoint.includes('live=all')) {
      return _generateMockLiveMatches();
    }
    
    // Parse league ID
    const leagueMatch = endpoint.match(/league=(\d+)/);
    if (!leagueMatch) return [];
    const leagueId = parseInt(leagueMatch[1], 10);
    
    // Generate mock matches for this league
    const matches = _generateMockFixtures(leagueId);
    
    // Sort matches by date
    matches.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));
    
    // Parse next count if present
    const nextMatch = endpoint.match(/next=(\d+)/);
    if (nextMatch) {
      const count = parseInt(nextMatch[1], 10);
      const now = Date.now();
      const upcoming = matches.filter(m => new Date(m.fixture.date).getTime() > now);
      return upcoming.slice(0, count);
    }
    
    return matches;
  },
  async fetchCached(endpoint, cacheKey, ttlMs) {
    const now = Date.now();
    const cached = this._cache[cacheKey];
    if (cached && (now - cached.ts < ttlMs)) return cached.data;
    const key = this._getKey();
    if (!key) return this.getMockData(endpoint);
    try {
      const r = await fetch('https://v3.football.api-sports.io/' + endpoint, {
        headers: { 'x-apisports-key': key }
      });
      if (!r.ok) return this.getMockData(endpoint);
      const json = await r.json();
      
      // Fallback if plan returns error for this season
      if (json.errors && Object.keys(json.errors).length > 0) {
        console.warn('API-Football returned errors, falling back to mock data:', json.errors);
        return this.getMockData(endpoint);
      }
      
      const data = json.response || [];
      if (data.length === 0 && (endpoint.includes('season=2025') || endpoint.includes('season=2026') || endpoint.includes('live=all'))) {
        return this.getMockData(endpoint);
      }

      const entry = { data, ts: now };
      this._cache[cacheKey] = entry;
      return data;
    } catch(e) { 
      console.error('Football API error:', e); 
      return this.getMockData(endpoint); 
    }
  },
  getFixtures(leagueId, season) {
    return this.fetchCached(`fixtures?league=${leagueId}&season=${season}`, `fix_${leagueId}_${season}`, 6*3600*1000);
  },
  getNextMatches(leagueId, season, count=10) {
    return this.fetchCached(`fixtures?league=${leagueId}&season=${season}&next=${count}`, `next_${leagueId}_${season}`, 300*1000);
  },
  getLive() {
    return this.fetchCached('fixtures?live=all', 'live_all', 60*1000);
  }
};

// Purge any stale football localStorage cache items on load
(function() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('fb_')) {
        localStorage.removeItem(key);
        i--;
      }
    }
  } catch (e) {
    console.error('Failed to clear football cache:', e);
  }
})();
