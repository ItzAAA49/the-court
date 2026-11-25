'use strict';

const fs = require('node:fs');
const path = require('node:path');

function replaceOnce(source, before, after, label) {
  const index = source.indexOf(before);
  if (index < 0) throw new Error('Patch target not found: ' + label);
  if (source.indexOf(before, index + before.length) >= 0) throw new Error('Patch target is ambiguous: ' + label);
  return source.slice(0, index) + after + source.slice(index + before.length);
}
function lines(items) { return items.join('\n'); }
function edit(root, file, changes) {
  const full = path.join(root, file);
  let text = fs.readFileSync(full, 'utf8');
  for (const change of changes) text = replaceOnce(text, change.before, change.after, file + ': ' + change.name);
  fs.writeFileSync(full, text, 'utf8');
}
function apply(root) {
  edit(root, 'server/ai.js', [
    {
      name: 'add readable API error classification',
      before: 'async function askOpenAI(prompt, maxOutputTokens = 1200) {',
      after: lines([
        'function publicApiError(error) {',
        "  const message = String(error && error.message || error || '');",
        "  if (/no credits remaining|insufficient_quota|billing_hard_limit|quota.*exceeded/i.test(message)) return 'OpenAI APIの利用クレジットが残っていません。アカウントの利用状況を確認するまで、AIの会話・事件生成は停止します。';",
        "  if (/invalid_api_key|incorrect api key|unauthorized|authentication/i.test(message)) return 'OpenAI APIキーを認証できません。RenderのOPENAI_API_KEY設定を確認してください。';",
        "  if (/model.*not found|does not exist|unsupported.*model/i.test(message)) return '指定されたAIモデルを利用できません。OPENAI_MODELの設定を確認してください。';",
        "  if (/rate_limit|rate limit|too many requests/i.test(message)) return 'AI APIのリクエスト上限に達しました。少し時間をおいてから再度お試しください。';",
        "  if (/timeout|aborted|timed out/i.test(message)) return 'AI APIの応答がタイムアウトしました。もう一度お試しください。';",
        "  return 'AI APIへの接続に失敗しました。Renderのログで原因を確認してください。';",
        '}',
        '',
        'async function askOpenAI(prompt, maxOutputTokens = 1200) {'
      ])
    },
    {
      name: 'missing API key is an explicit error',
      before: '  if (!apiKey) return null;',
      after: lines([
        '  if (!apiKey) {',
        "    const error = new Error('OPENAI_API_KEY is not configured');",
        "    error.publicMessage = 'RenderにOPENAI_API_KEYが設定されていません。';",
        '    throw error;',
        '  }'
      ])
    },
    {
      name: 'case generation exposes the real failure',
      before: "    return { caseFile: fallback, aiConnected: false, aiNote: 'AI接続に失敗したため、内蔵シナリオに切り替えました。' };",
      after: lines([
        '    const aiError = error.publicMessage || publicApiError(error);',
        '    return { caseFile: fallback, aiConnected: false, apiConfigured: Boolean(process.env.OPENAI_API_KEY), aiError, aiNote: aiError };'
      ])
    },
    {
      name: 'day generation exposes the real failure',
      before: '    return { update: fallback, aiConnected: false };',
      after: '    return { update: fallback, aiConnected: false, apiConfigured: Boolean(process.env.OPENAI_API_KEY), aiError: error.publicMessage || publicApiError(error) };'
    },
    {
      name: 'prompt requires direct, varied, context-aware speech',
      before: '返答は自然な日本語で、80〜180字程度。軽いゲームの空気はあるが、裁判の論点は真面目に扱う。',
      after: '会話相手の質問に正面から答える自然で個性的な日本語で、100〜220字程度。最初に質問の核心へ直接答え、そのあと理由や根拠を補う。軽いゲームの空気はあるが、裁判の論点は真面目に扱う。定型文や毎回同じ言い回しを避け、人物の性格・立場・知識・直前までの会話に合わせて話す。'
    },
    {
      name: 'prompt uses role and conversation context',
      before: '- 質問に答えられないときは自然にそう言う。',
      after: lines([
        '- 質問に答えられないときは自然にそう言う。',
        '- 質問の核心にまず直接答える。質問を言い換えただけの返答にしない。',
        '- 直前までの会話を踏まえ、同じ質問にも会話の進展に応じて答え方を変える。',
        '- 検察官は立証の筋道を、弁護人は証拠の限界を、被告人は本人の記憶や感情を、証人は自分が直接知る範囲を中心に話す。'
      ])
    },
    {
      name: 'do not substitute a canned character quote',
      before: "    return { reply: fallbackReply(role, question, caseFile), reaction: '少し考え込んでいる。', aiConnected: false };",
      after: "    return { reply: '', reaction: '', aiConnected: false, apiConfigured: Boolean(process.env.OPENAI_API_KEY), aiError: error.publicMessage || publicApiError(error) };"
    },
    {
      name: 'verdict exposes connection failure',
      before: '    return { ...fallback, aiConnected: false };',
      after: '    return { ...fallback, aiConnected: false, apiConfigured: Boolean(process.env.OPENAI_API_KEY), aiError: error.publicMessage || publicApiError(error) };'
    }
  ]);

  edit(root, 'public/js/ui.js', [
    {
      name: 'honest AI status and persistent warning',
      before: lines([
        '  function setAIStatus(connected, configured) {',
        "    const label = connected ? 'AI RESPONSE ACTIVE' : (configured ? 'AI接続を確認中' : 'AI未設定 · BASIC MODE');",
        "    $('ai-status').textContent = label;",
        "    $('ai-status').classList.toggle('is-live', connected);",
        "    $('landing-ai-status').textContent = connected ? 'AI応答システム稼働中' : (configured ? 'AIの応答を確認中' : 'AIキー未設定 · 内蔵シナリオでプレイ可能');",
        '  }'
      ]),
      after: lines([
        "  function setAIStatus(connected, configured, issue = '') {",
        "    const label = issue ? 'AI利用不可' : (connected ? 'AI RESPONSE ACTIVE' : (configured ? 'AI API設定済み' : 'AI未設定 · BASIC MODE'));",
        "    $('ai-status').textContent = label;",
        "    $('ai-status').classList.toggle('is-live', Boolean(connected));",
        "    $('ai-status').classList.toggle('is-error', Boolean(issue));",
        "    $('landing-ai-status').textContent = issue ? 'AI利用不可 · API設定を確認してください' : (connected ? 'AI応答システム稼働中' : (configured ? 'AI APIキー設定済み · 応答時に接続確認' : 'AIキー未設定 · 内蔵シナリオでプレイ可能'));",
        '  }',
        "  function showAIWarning(message = '') {",
        "    const warning = $('ai-warning');",
        '    if (!warning) return;',
        '    warning.textContent = message;',
        '    warning.hidden = !message;',
        '  }'
      ])
    },
    {
      name: 'export warning function',
      before: 'window.CourtUI = { $, esc, showScreen, setLoading, setAIStatus, showToast, setBusy, showModal, closeModal, renderCareer, renderCase, renderEvidence, renderPhase, renderPaper, renderDialogue, renderEvents, fillVerdictLaws, renderResult, renderAudience };',
      after: 'window.CourtUI = { $, esc, showScreen, setLoading, setAIStatus, showAIWarning, showToast, setBusy, showModal, closeModal, renderCareer, renderCase, renderEvidence, renderPhase, renderPaper, renderDialogue, renderEvents, fillVerdictLaws, renderResult, renderAudience };'
    }
  ]);

  edit(root, 'public/js/app.js', [
    {
      name: 'health status is not falsely called connected',
      before: "      UI.setAIStatus(false, Boolean(status.aiConfigured));",
      after: "      UI.setAIStatus(false, Boolean(status.aiConfigured), status.aiError || '');\n      UI.showAIWarning(status.aiError || '');"
    },
    {
      name: 'show AI case-generation state',
      before: lines([
        '      UI.setAIStatus(game.aiConnected, game.aiConnected);',
        '      if (game.aiNote) UI.showToast(game.aiNote, !game.aiConnected);'
      ]),
      after: lines([
        "      UI.setAIStatus(game.aiConnected, Boolean(result.apiConfigured || result.aiConnected), result.aiError || '');",
        "      UI.showAIWarning(result.aiError || '');",
        '      if (game.aiNote) UI.showToast(game.aiNote, !game.aiConnected);'
      ])
    },
    {
      name: 'show AI day-update state',
      before: lines([
        '      UI.setAIStatus(Boolean(result.aiConnected), Boolean(result.aiConnected));',
        '      UI.setLoading(false);'
      ]),
      after: lines([
        "      UI.setAIStatus(Boolean(result.aiConnected), Boolean(result.apiConfigured || result.aiConnected), result.aiError || '');",
        "      UI.showAIWarning(result.aiError || '');",
        '      UI.setLoading(false);'
      ])
    },
    {
      name: 'do not display a fallback as a real person speaking',
      before: lines([
        "      game.dialogue.push({ role: 'judge-question', name: \`裁判官 → \${roleName(role)}\`, text: question, time: timestamp });",
        "      game.dialogue.push({ role, name: roleName(role), text: result.reply, reaction: result.reaction, time: 'REPLY' });",
        "      game.transcript.push({ role, question, reply: result.reply, phase: game.steps[game.phaseIndex].title });",
        '      game.transcript = game.transcript.slice(-16);',
        '      UI.renderDialogue(game.dialogue);',
        "      $('question-input').value = '';",
        '      UI.setAIStatus(Boolean(result.aiConnected), Boolean(result.aiConnected));',
        "      if (!result.aiConnected) UI.showToast('内蔵の返答に切り替えました。APIキーを設定すると自然な対話になります。');"
      ]),
      after: lines([
        "      game.dialogue.push({ role: 'judge-question', name: \`裁判官 → \${roleName(role)}\`, text: question, time: timestamp });",
        '      if (result.aiConnected && result.reply) {',
        "        game.dialogue.push({ role, name: roleName(role), text: result.reply, reaction: result.reaction, time: 'REPLY' });",
        '        game.transcript.push({ role, question, reply: result.reply, phase: game.steps[game.phaseIndex].title });',
        '        game.transcript = game.transcript.slice(-16);',
        '      } else {',
        "        game.dialogue.push({ role: 'system', name: 'AI接続状況', text: result.aiError || 'AIから返答を受け取れませんでした。API設定と利用状況を確認してください。', time: 'NOTICE' });",
        '      }',
        '      UI.renderDialogue(game.dialogue);',
        "      $('question-input').value = '';",
        "      UI.setAIStatus(Boolean(result.aiConnected), Boolean(result.apiConfigured || result.aiConnected), result.aiError || '');",
        "      UI.showAIWarning(result.aiError || '');",
        "      if (!result.aiConnected) UI.showToast(result.aiError || 'AIから返答を取得できませんでした。', true);"
      ])
    },
    {
      name: 'verdict status uses API error state',
      before: '      UI.setAIStatus(Boolean(evaluation.aiConnected), Boolean(evaluation.aiConnected));',
      after: "      UI.setAIStatus(Boolean(evaluation.aiConnected), Boolean(evaluation.apiConfigured || evaluation.aiConnected), evaluation.aiError || '');\n      UI.showAIWarning(evaluation.aiError || '');"
    }
  ]);

  edit(root, 'public/index.html', [
    {
      name: 'insert visible AI service warning',
      before: '            </form>\n            <div id="dialogue-log"',
      after: '            </form>\n            <div id="ai-warning" class="ai-warning" role="status" aria-live="polite" hidden></div>\n            <div id="dialogue-log"'
    },
    {
      name: 'load dark theme after base stylesheet',
      before: '  <link rel="stylesheet" href="/css/style.css">',
      after: '  <link rel="stylesheet" href="/css/style.css">\n  <link rel="stylesheet" href="/css/dark-theme.css">'
    }
  ]);

  const darkTheme = [
    ':root { color-scheme: dark; --ink:#edf2f8; --ink-soft:#bac5d2; --navy:#070a0f; --navy-2:#101721; --blue:#253448; --paper:#131b26; --paper-2:#1b2634; --white:#202b39; --line:rgba(210,222,238,.16); --shadow:0 18px 52px rgba(0,0,0,.38); }',
    'html,body,#app-shell { background:#070a0f; color:#edf2f8; }',
    '.court-screen { background:#080c12; color:#e9eff7; }',
    '.landing-screen { background:radial-gradient(circle at 78% 20%,rgba(189,146,80,.09),transparent 32%),linear-gradient(135deg,#05070b 0%,#0b111a 58%,#070a0f 100%); }',
    '.landing-topline { color:#d1d9e4; font-size:12px; } .topline-right { color:#aab5c4; } .hero-description { color:#c0cad6; font-size:15px; } .landing-info-grid p { color:#c0cad6; font-size:13px; } .landing-footer,.landing-footnote { color:#aab6c5; font-size:11px; } .eyebrow,.section-kicker { color:#d5b779; font-size:11px; } .text-button { color:#e5c98f; font-size:13px; }',
    '.court-header { background:#070b11; border-color:#344253; } .court-brand small,.header-case span,.metric span,.trust-meter>span { color:#bec9d7; font-size:10px; } .header-case strong { color:#f0f4f9; font-size:17px; } .metric strong { font-size:22px; } .era-metric strong { color:#eef2f7; font-size:12px; } .trust-meter strong { color:#f3dfb7; font-size:12px; } .ai-status { color:#d8c18f; font-size:11px; } .ai-status.is-error { color:#ffb4a9; border-color:rgba(255,140,125,.45); background:rgba(120,35,30,.2); }',
    '.newspaper-strip { background:#111923; border-color:#394757; } .paper-label { background:#0a111a; color:#f5e8cc; border-color:#b99b64; } .paper-label span,.paper-label small { color:#d6c7a7; font-size:10px; } .paper-label strong { color:#f1dfb8; } .paper-headline span { color:#d9bd84; font-size:11px; } .paper-headline h2 { color:#f0f4f8; font-size:clamp(18px,1.65vw,24px); } .paper-headline p { color:#c5cfdb; font-size:13px; } .button-paper { background:#273648; color:#f5f7fa; border-color:#506174; font-size:12px; }',
    '.court-layout { background:#080c12; } .room-heading { color:#edf2f8; } .room-heading h2 { color:#f4f6fa; font-size:21px; } .room-heading p { color:#c1ccda; font-size:14px; line-height:1.65; }',
    '.interaction-panel,.side-card { background:#121a25; color:#e7edf5; border:1px solid #354456; box-shadow:0 8px 22px rgba(0,0,0,.22); } .interaction-panel { padding:16px; } .interaction-topline h3,.side-card-heading h3 { color:#f0f4f9; font-size:17px; } .interaction-hint { color:#c0cad6; font-size:12px; }',
    '.question-form select,.question-form input,.verdict-form select,.verdict-form textarea { background:#080e16; color:#f0f4fa; border:1px solid #516175; font-size:15px; min-height:44px; } .question-form input::placeholder,.verdict-form textarea::placeholder { color:#9eacbd; opacity:1; } .question-form select:focus,.question-form input:focus,.verdict-form select:focus,.verdict-form textarea:focus { outline:2px solid #d9b977; outline-offset:2px; } .question-form .button { font-size:14px; min-height:44px; }',
    '.ai-warning { margin:10px 0; padding:11px 13px; border:1px solid rgba(234,154,136,.55); border-left:4px solid #e58f7c; border-radius:5px; background:#2a1719; color:#ffe0d9; font-size:14px; line-height:1.65; }',
    '.dialogue-log { background:#080e15; border:1px solid #2b3949; } .empty-dialogue { color:#aebaca; font-size:14px; } .dialogue-entry { background:#151f2b; border-color:#39485a; color:#edf2f8; } .dialogue-entry.judge-question { background:#1d2938; border-color:#64758b; } .dialogue-entry.prosecutor { border-left-color:#cb7e72; } .dialogue-entry.defender { border-left-color:#75a3d1; } .dialogue-entry.witness { border-left-color:#9caa80; } .dialogue-entry.system { flex-basis:100%; background:#2a1719; border-color:#874c46; } .dialogue-meta strong { color:#e8d1a4; font-size:12px; } .dialogue-meta span { color:#aebacc; font-size:10px; } .dialogue-entry p { color:#edf2f8; font-size:14px; line-height:1.7; } .dialogue-entry small { color:#c4cfdb; font-size:12px; }',
    '.side-card { padding:16px; } .side-card-heading .section-kicker { color:#d8bd88; } .case-card h3 { color:#f4f6fa; font-size:20px; } .case-tags span,.count-pill { background:#263445; border-color:#4a5b70; color:#e0e8f2; font-size:11px; } .case-card>p { color:#d1dae5; font-size:14px; line-height:1.75; } .charge-box,.issue-box { background:#1b2735; border-color:#435368; } .charge-box small,.issue-box small { color:#d9bd88; font-size:11px; } .charge-box strong,.issue-box strong { color:#eff3f8; font-size:14px; line-height:1.65; }',
    '.evidence-item { background:#182330; border-color:#3b4a5d; } .evidence-index { color:#dfc48f; font-size:13px; } .evidence-copy strong { color:#f0f4f8; font-size:14px; } .evidence-copy p { color:#c8d2df; font-size:13px; line-height:1.65; } .evidence-meta { color:#b9c5d3; font-size:11px; }',
    '.argument-block { background:#1a2634; border-color:#435266; } .argument-block span { font-size:12px; } .argument-block p { color:#d7e0eb; font-size:13px; line-height:1.7; } .prosecution-argument span { color:#f0a197; } .defense-argument span { color:#9bc6ee; } .court-event-log p { border-color:#354456; color:#d5deea; font-size:13px; line-height:1.65; } .court-event-log p b { color:#d8bd88; font-size:11px; }',
    '.court-footer { background:#080d14; border-color:#3a4859; } .footer-left strong { color:#e5d0a4; font-size:12px; } .footer-left small { color:#c0cad7; font-size:11px; } .button { font-size:14px; min-height:44px; } .button-advance { min-width:160px; font-size:14px; } .progress-track { background:#263445; }',
    '.modal-backdrop { background:rgba(0,0,0,.84); } .modal-sheet { background:#111923; border:1px solid #665638; color:#e9eff6; box-shadow:0 30px 90px rgba(0,0,0,.72); } .modal-sheet::before { border-color:rgba(210,185,132,.16); } .modal-close { color:#d2dbe6; font-size:28px; } .modal-sheet h2 { color:#f1f4f8; font-size:30px; } .modal-intro,.referendum-sheet p,.incident-sheet p { color:#c6d0dc; font-size:14px; line-height:1.75; }',
    '.newspaper-masthead { color:#f0e2c2; border-color:#a58d60; } .newspaper-masthead small { color:#bec9d6; font-size:11px; } .paper-kicker { color:#d6b77a; font-size:11px; } .newspaper-sheet h2 { color:#f2f5f8; border-color:#3b4b5e; } .news-modal-deck { color:#c9d3df; font-size:15px; line-height:1.7; } .news-articles p { color:#d1dbe6; border-color:#344355; font-size:14px; line-height:1.75; } .news-articles p span { color:#d6b77a; } .paper-public-mood { background:#1a2734; border-left-color:#c6a66c; } .paper-public-mood small { color:#e1c68f; font-size:11px; } .paper-public-mood p { color:#d9e1eb; font-size:13px; line-height:1.65; }',
    '.verdict-form label { color:#d3dce7; font-size:13px; } .verdict-form select,.verdict-form textarea { border-radius:5px; padding:12px; } .verdict-warning { color:#e3d3b5; background:#202b37; font-size:12px; line-height:1.7; } .result-verdict-card { background:#1d2936; border-color:#d1b27a; } .result-verdict-card small,.result-verdict-card span { color:#ddc18a; font-size:11px; } .result-verdict-card h3 { color:#f3f5f8; } .result-verdict-card p,.result-assessment p { color:#d0d9e4; font-size:14px; line-height:1.75; } .result-assessment .legal-note { background:#202b37; color:#e0d2b6; } .result-assessment .public-reaction { color:#e2c58c; } .result-metrics { border-color:#3c4a5b; } .result-metrics small { color:#bdc8d5; font-size:11px; } .result-metrics strong { color:#f0d69f; }',
    '.help-steps p { color:#d0d9e4; border-color:#374658; font-size:14px; line-height:1.8; } .help-steps b { color:#f2d8a5; } .help-note { background:#202b37; color:#e0d2b6; font-size:13px; line-height:1.75; } .toast { background:#161f2b; border-color:#6c5b3e; color:#f0f4f8; font-size:13px; line-height:1.6; } .muted-small { color:#b7c3d1; font-size:13px; }',
    '@media (max-width:800px) { .paper-headline h2 { font-size:17px; } .paper-headline p { font-size:12px; } .button-paper { font-size:11px; } .interaction-panel,.side-card { padding:13px; } .room-heading h2 { font-size:19px; } .court-character strong { font-size:10px; } .court-character small { font-size:9px; } .character-nameplate { font-size:8px; } .footer-left strong { font-size:10px; } .button-advance { font-size:12px; } .ai-warning { font-size:13px; } }',
    '@media (max-width:460px) { .question-form select,.question-form input { min-height:44px; font-size:14px; } .question-form .button { font-size:13px; } .dialogue-entry p { font-size:13px; } .room-heading p { font-size:13px; } .case-card>p,.evidence-copy p,.argument-block p,.court-event-log p { font-size:13px; } .modal-sheet { background:#111923; } }'
  ].join('\n');
  fs.writeFileSync(path.join(root, 'public/css/dark-theme.css'), darkTheme, 'utf8');
  return { ok: true, theme: 'dark', patched: ['server/ai.js','public/js/ui.js','public/js/app.js','public/index.html','public/css/dark-theme.css'] };
}

module.exports = { apply };
