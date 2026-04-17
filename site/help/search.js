// TopGun Help Center — Search
const SEARCH_DATA = [
  {
    page: 'Getting Started',
    title: 'Install TopGun',
    excerpt: 'Install TopGun with a single command: /plugin install alo-labs/topgun. SENTINEL v2.3.0 ships bundled inside the plugin — no external audit skill required.',
    url: 'getting-started/#install'
  },
  {
    page: 'Getting Started',
    title: 'Your First /topgun Invocation',
    excerpt: 'Run /topgun followed by a plain-English description of the skill you need. TopGun will search 18+ registries, score candidates, and run the SENTINEL audit.',
    url: 'getting-started/#first-run'
  },
  {
    page: 'Core Concepts',
    title: 'The 4-Stage Pipeline',
    excerpt: 'FindSkills → CompareSkills → SecureSkills → InstallSkills. Every /topgun run executes all four stages. The pipeline can resume from state.json if interrupted.',
    url: 'concepts/#pipeline'
  },
  {
    page: 'Core Concepts',
    title: 'Scoring Rubric',
    excerpt: 'Candidates are scored on capability match (40%), security posture (25%), popularity (20%), and recency (15%). Composite score determines the winner.',
    url: 'concepts/#scoring'
  },
  {
    page: 'Core Concepts',
    title: 'SENTINEL Audit',
    excerpt: 'SENTINEL requires 2 consecutive clean passes before installation is allowed. SHA-256 hash is verified between passes. Any mismatch aborts the pipeline.',
    url: 'concepts/#sentinel'
  },
  {
    page: 'Command Reference',
    title: '/topgun Flags',
    excerpt: 'Available flags: --registries, --offline, --reset, --force-audit, --auto-approve. Control which registries are searched, caching behavior, and approval flow.',
    url: 'reference/#flags'
  },
  {
    page: 'Command Reference',
    title: 'Output Files (~/.topgun/)',
    excerpt: 'TopGun writes state.json, candidates.json, audit-manifest.json, and install-log.json to ~/.topgun/. These files enable pipeline resume and audit trails.',
    url: 'reference/#output-files'
  },
  {
    page: 'Troubleshooting',
    title: 'SENTINEL Not Found',
    excerpt: 'If the bundled SENTINEL file is missing (skills/sentinel/SKILL.md), TopGun will abort before the SecureSkills stage. Reinstall TopGun to restore it: /plugin install alo-labs/topgun.',
    url: 'troubleshooting/#sentinel-missing'
  }
];

(function(){
  const input = document.getElementById('search-input');
  const resultsSection = document.getElementById('search-results-section');
  const resultsList = document.getElementById('search-results-list');
  const mainContent = document.getElementById('main-help-content');

  if (!input) return;

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function search(q) {
    if (!q || q.trim().length < 2) return null;
    const terms = q.toLowerCase().split(/\s+/);
    return SEARCH_DATA.filter(item => {
      const haystack = (item.title + ' ' + item.excerpt + ' ' + item.page).toLowerCase();
      return terms.every(t => haystack.includes(t));
    });
  }

  function renderResults(results, q) {
    if (results === null) {
      resultsSection.style.display = 'none';
      mainContent.style.display = '';
      return;
    }
    resultsSection.style.display = '';
    mainContent.style.display = 'none';
    if (results.length === 0) {
      resultsList.innerHTML = '<p class="sr-none">No results found for <strong>"' + escapeHtml(q) + '"</strong>. Try different keywords.</p>';
      return;
    }
    resultsList.innerHTML = results.map(r =>
      '<a class="sr-item" href="' + escapeHtml(r.url) + '">' +
        '<span class="sr-page">' + escapeHtml(r.page) + '</span>' +
        '<span class="sr-title">' + escapeHtml(r.title) + '</span>' +
        '<span class="sr-excerpt">' + escapeHtml(r.excerpt) + '</span>' +
      '</a>'
    ).join('');
  }

  let debounceTimer;
  input.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = input.value.trim();
      if (q.length < 2) {
        renderResults(null, q);
      } else {
        renderResults(search(q), q);
      }
    }, 180);
  });
})();
