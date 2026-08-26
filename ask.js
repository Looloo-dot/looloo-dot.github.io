/* ask.js — the resident assistant
   A hand-built retrieval Q&A, fully client-side: a curated knowledge
   base and a keyword scorer. It answers only from what it knows and
   says so when it doesn't — no API, no key, no hallucination.
   (README documents the optional Cloudflare Worker + LLM upgrade.) */

(function () {
  'use strict';

  var log = document.getElementById('chat-log');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-in');
  var chips = document.getElementById('chat-chips');
  if (!log || !form) return;

  var EMAIL = 'yiven.zhu@oii.ox.ac.uk';

  /* Set this to your deployed Cloudflare Worker URL (see worker.js) and
     the chat upgrades itself from the local matcher to a real language
     model, grounded in the same facts. Empty string = local matcher. */
  var LLM_ENDPOINT = '';

  /* -- knowledge ------------------------------------------------------ */
  var KB = [
    { k: 'research study work topic focus what do does interest area',
      a: 'Louis researches AI evaluation: whether the benchmark scores used to judge AI systems can be trusted. He applies psychometrics (item response theory, factor analysis, validity theory) to benchmarks and LLM judges, then follows the scores into prices, wages and regulation.' },
    { k: 'oxford oii msc masters degree study studying university current',
      a: 'He is an MSc candidate at the Oxford Internet Institute, University of Oxford (2026–27), at St Antony’s College.' },
    { k: 'ucl undergraduate bsc bachelor sts science technology studies degree',
      a: 'He read Science & Technology Studies at UCL (2023–26), graduating with first-class honours, first in his year.' },
    { k: 'phd doctorate doctoral future plan next 2027',
      a: 'He is aiming at doctoral work from 2027, on the measurement and validity of AI evaluation.' },
    { k: 'publication paper papers published wrote writing research output',
      a: 'Ten active papers, one published: "From Advisor to Voting Teammate" (ACM CHI 2026 workshop). Under review at NeurIPS 2026 workshops: "One Capability or Many?", "The Price of Intelligence", the classical-test-theory paper on LLM judges, and "A Score Should Travel With Its Repair History" — with full versions of the first two aimed at ICLR and FAccT 2027. "When Should Neural Data Inform Welfare?" has an invited revise-and-resubmit at the UCL Journal of Economics; the EvalEval "Science of Evaluations" and his MMLU study are in preparation; plus two SSRN working papers on automation-risk wages and AI-risk disclosure. The research section above has all of them.' },
    { k: 'price intelligence index inference cost faact hedonic',
      a: '"The Price of Intelligence" builds a quality-adjusted price index for AI inference: 782 models over 31 months, priced per unit of capability. Most of the decline — 87% — is invisible to standard matched-model methods. Pre-registered on OSF; under review at the NeurIPS 2026 EconML workshop, with the full version aimed at FAccT 2027.' },
    { k: 'capability factor iclr benchmark battery economic validity one many',
      a: '"One Capability or Many?" tests twelve benchmarks that claim to measure different skills across 421 model configurations — one factor carries 74.5% of the common variance. With Marcos Barreto at LSE Statistics.' },
    { k: 'mmlu dissertation validity argument harness unassembled',
      a: 'His BSc dissertation follows MMLU through six years of patches and re-scorings, showing the score depends on the harness that produced it. It won the STS Best Dissertation Prize and is being turned into a paper.' },
    { k: 'judge judges llm ctt classical test theory reliability neurips',
      a: '"Three Ways Classical Test Theory Misleads for LLM Judges" is under review at the NeurIPS 2026 workshop on reliable evaluation (JUDGe): the borrowed reliability statistics rest on assumptions LLM-judge pipelines break.' },
    { k: 'chi advisor voting teammate agent group simulation abm',
      a: '"From Advisor to Voting Teammate" (ACM CHI 2026 workshop) simulates 1.1M group decisions with an AI as advisor or voting member — its institutional role matters more than its accuracy. The title in the research section links to the PDF.' },
    { k: 'experience job work worked roles history employment',
      a: 'Current and recent: Departmental Associate at UCL STS (designing a module on AI and work), summer researcher at LSE Statistics, researcher with the EvalEval Coalition, and previously Holistic AI, UCL Computer Science, the Institute of Economic Affairs, and the UCL Institute for Global Prosperity. Details in the experience section.' },
    { k: 'teach teaching module course ucl associate labour',
      a: 'He is designing a new UCL undergraduate module on AI, automation and platform labour from the syllabus up, as a Departmental Associate, and was a teaching assistant on UCL’s Responsible Innovation and Governance of Emerging Technologies courses.' },
    { k: 'evaleval coalition hugging face standards science evaluations',
      a: 'With the EvalEval Coalition (Hugging Face, Edinburgh, EleutherAI) he writes the validity sections of the Science of Evaluations paper — what a field should show before claiming an evaluation measured anything.' },
    { k: 'benchprobe tool package software pytorch toolkit code',
      a: 'benchprobe is his PyTorch toolkit for auditing benchmark score matrices — factor structure, item difficulty, reliability. Release planned for October 2026; code on his GitHub.' },
    { k: 'repair history score travel stewardship meta science peer review norms',
      a: '"A Score Should Travel With Its Repair History" is his position paper under review at the NeurIPS 2026 workshop on AI for meta-science: benchmarks adjudicate the way peer review does, without its stewardship, so scores should carry their repair history with them.' },
    { k: 'neural neuroeconomics welfare brain data policy',
      a: '"When Should Neural Data Inform Welfare?" is his critical framework for policy uses of neuroeconomics — it has an invited revise-and-resubmit at the UCL Journal of Economics, and a preprint on arXiv.' },
    { k: 'disclosure signalling signal capital markets sec act firms regulation mandatory',
      a: '"Mandatory AI-Risk Disclosure as a Signalling Device in Capital Markets" is his SSRN working paper: if firms must disclose AI risk, disclosure becomes a signal, analysed as a game of audits, costs and penalties under the EU AI Act and the SEC’s proposed rules.' },
    { k: 'award prize won recognition medawar proctor honours',
      a: 'Peter Medawar Prize (UCL’s top overall BSc result), STS Best Dissertation Prize, first in cohort, and the Joan Beauchamp Proctor Prize for top Year 2 performance.' },
    { k: 'talk talks conference presented presentation speaking',
      a: 'Recent talks: the CHI 2026 workshop on human–agent collaboration, an invited talk at the UCL Centre for Responsible Innovation on the MMLU work, and Explore Econ 2025 at UCL.' },
    { k: 'method methods statistics stats skills irt technical tools',
      a: 'In regular use: 2PL item response theory, exploratory factor analysis, generalisability theory, Krippendorff’s alpha, panel fixed effects, and DoubleML. He is also partway through the MITx MicroMasters in Statistics and Data Science.' },
    { k: 'hobby hobbies fun free time hockey ski skiing piano music sport',
      a: 'Off the desk: ice hockey, alpine ski racing, and piano.' },
    { k: 'language languages speak chinese french english',
      a: 'English and Chinese, plus conversational French.' },
    { k: 'contact email reach write message touch hire collaborate',
      a: 'Email him at ' + EMAIL + ' — or use the button in the contact section. Data, code and pre-registrations are shared on request.' },
    { k: 'linkedin github scholar orcid profile links social',
      a: 'All linked at the top of the page: LinkedIn (linkedin.com/in/yiven-z), Google Scholar, GitHub (github.com/Looloo-dot) and ORCID.' },
    { k: 'landscape terrain frontier benchmark banner animation ascii art top page what is 3d',
      a: 'The banner is a live 3D benchmark landscape drawn entirely in ASCII. MMLU/HELM, HLE, SWE-Bench, Terminal-Bench v2.1, GDPval and tau3-Banking appear as different regions; the raised frontier moves across them because the frontier changes with the test. Hover deforms the surface, drag to orbit it through a full 360 degrees, and click to send an evaluation pulse. Hand-written JavaScript, no libraries.' },
    { k: 'who you bot assistant this chat are real ai gpt',
      a: 'I’m a small hand-built assistant — no API behind me, just this page’s knowledge and a keyword matcher. Whatever I can’t answer, Louis can: ' + EMAIL + '.' },
    { k: 'name yiven pronounce louis called',
      a: 'Louis Yiven Zhu — Louis to colleagues.' },
    { k: 'where live location based city oxford london',
      a: 'Oxford, UK — he moves there in October 2026 for the MSc; before that, London.' }
  ];

  KB.forEach(function (e) { e.keys = e.k.split(' '); });

  var FALLBACK = 'That one’s beyond what this page knows — I only answer from what’s here. For anything else, ' + EMAIL + ' reaches the person himself.';

  function answer(q) {
    var words = q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(function (w) { return w.length > 2; })
      .map(function (w) { return w.length > 3 && w.slice(-1) === 's' ? w.slice(0, -1) : w; });
    var best = null, bestScore = 0, bestStrong = false;
    KB.forEach(function (e) {
      var s = 0, strong = false;
      words.forEach(function (w) {
        e.keys.forEach(function (k) {
          var kk = k.length > 3 && k.slice(-1) === 's' ? k.slice(0, -1) : k;
          if (kk === w) {
            s += kk.length;
            if (kk.length >= 5) strong = true;   /* one specific word suffices */
          } else if (kk.length > 4 && (kk.indexOf(w) === 0 || w.indexOf(kk) === 0)) {
            s += Math.max(3, kk.length - 2);
          }
        });
      });
      if (s > bestScore) { bestScore = s; best = e; bestStrong = strong; }
    });
    /* generic words ("what", "who") must not carry a match alone, but a
       single specific word ("email", "award", "benchprobe") should */
    return best && (bestScore >= 6 || bestStrong) ? best.a : FALLBACK;
  }

  /* -- rendering ------------------------------------------------------ */
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var typing = 0;

  function bubble(who, text, type) {
    var row = document.createElement('div');
    row.className = 'msg ' + (who === 'you' ? 'is-you' : 'is-bot');
    var tag = document.createElement('span');
    tag.className = 'msg-tag';
    tag.textContent = who;
    var body = document.createElement('p');
    body.className = 'msg-body';
    row.appendChild(tag);
    row.appendChild(body);
    log.appendChild(row);

    if (type && !reduce) {
      var i = 0, my = ++typing;
      (function tick() {
        if (my !== typing) { body.textContent = text; return; }
        body.textContent = text.slice(0, ++i);
        log.scrollTop = log.scrollHeight;
        if (i < text.length) setTimeout(tick, 9);
      }());
    } else {
      body.textContent = text;
    }
    log.scrollTop = log.scrollHeight;
  }

  function ask(q) {
    q = q.trim();
    if (!q) return;
    bubble('you', q, false);

    if (!LLM_ENDPOINT) {
      var a = answer(q);
      setTimeout(function () { bubble('lz', a, true); }, reduce ? 0 : 260);
      return;
    }

    /* real model behind a private relay; local matcher is the fallback */
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var timer = ctl && setTimeout(function () { ctl.abort(); }, 8000);
    fetch(LLM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
      signal: ctl ? ctl.signal : undefined
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        clearTimeout(timer);
        bubble('lz', (d && d.answer) ? d.answer : answer(q), true);
      })
      .catch(function () {
        clearTimeout(timer);
        bubble('lz', answer(q), true);
      });
  }


  form.addEventListener('submit', function (e) {
    e.preventDefault();
    ask(input.value);
    input.value = '';
    input.focus();
  });

  if (chips) {
    chips.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      ask(b.textContent);
    });
  }

  bubble('lz', 'Ask me about Louis — his research, experience, papers, or anything on this page.', false);
}());
